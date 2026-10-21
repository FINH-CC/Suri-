import * as THREE from 'three';

/*
 * Soft contact shading (screen-space ambient occlusion) for the lit product (legacy 1789-1853).
 * Darkens creases and places where parts meet (head on handle, button recess, grip edges, mount), the way
 * soft studio light falls off in a product render. Uses a supersampled normal+depth buffer (legacy drawing
 * pipeline `rt.n`, 1690-1716; only what SSAO needs is ported: no id buffer, no edge pass).
 */

const aoKernel = (() => {
  const k: THREE.Vector3[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 16; i++) {
    const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 0.9 + 0.1).normalize().multiplyScalar(rnd());
    let s = i / 16;
    s = 0.12 + 0.88 * s * s;
    k.push(v.multiplyScalar(s));
  }
  return k;
})();

const quadVS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

const AO_FS = `uniform sampler2D tN,tD;uniform mat4 proj,invProj;uniform vec3 kernel[16];uniform float radius,bias;varying vec2 vUv;
    vec3 viewPos(vec2 uv){float z=texture2D(tD,uv).x;vec4 p=invProj*vec4(uv*2.-1.,z*2.-1.,1.);return p.xyz/p.w;}
    float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      float z=texture2D(tD,vUv).x;if(z>=.99999){gl_FragColor=vec4(1.);return;}
      vec3 P=viewPos(vUv),N=normalize(texture2D(tN,vUv).xyz*2.-1.);
      float a=hash(floor(gl_FragCoord.xy))*6.2831853;vec3 r=vec3(cos(a),sin(a),.0);
      vec3 T=normalize(r-N*dot(r,N)),Bt=cross(N,T);mat3 TBN=mat3(T,Bt,N);
      float occ=0.;
      for(int i=0;i<16;i++){
        vec3 S=P+TBN*kernel[i]*radius;vec4 o=proj*vec4(S,1.);vec2 suv=o.xy/o.w*.5+.5;
        if(suv.x<0.||suv.x>1.||suv.y<0.||suv.y>1.)continue;
        float sz=viewPos(suv).z;
        occ+=(sz>=S.z+bias?1.:0.)*smoothstep(0.,1.,radius/max(abs(P.z-sz),1e-4));
      }
      gl_FragColor=vec4(vec3(1.-occ/16.),1.);
    }`;

const BLUR_FS = `uniform sampler2D tAO;uniform vec2 texel;uniform float strength;varying vec2 vUv;
    void main(){float s=0.;for(int x=-2;x<=2;x++)for(int y=-2;y<=2;y++)s+=texture2D(tAO,vUv+vec2(float(x),float(y))*texel).r;
      s/=25.;gl_FragColor=vec4(0.,0.,0.,(1.-s)*strength);}`;

export class SSAO {
  private readonly normalMats: Partial<Record<THREE.Side, THREE.MeshNormalMaterial>> = {};
  // bristle tufts write one flat normal, so the bristle field reads as one clean shape instead of a dark mass
  private readonly flatNormalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.5, 1), toneMapped: false });
  private readonly aoMat = new THREE.ShaderMaterial({
    uniforms: {
      tN: { value: null },
      tD: { value: null },
      proj: { value: new THREE.Matrix4() },
      invProj: { value: new THREE.Matrix4() },
      kernel: { value: aoKernel },
      radius: { value: 0.45 },
      bias: { value: 0.015 },
    },
    vertexShader: quadVS,
    fragmentShader: AO_FS,
    depthTest: false,
    depthWrite: false,
  });
  private readonly aoBlurMat = new THREE.ShaderMaterial({
    uniforms: { tAO: { value: null }, texel: { value: new THREE.Vector2() }, strength: { value: 0.42 } },
    vertexShader: quadVS,
    fragmentShader: BLUR_FS,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly aoScene = new THREE.Scene();
  private readonly aoBlurScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private rtN: THREE.WebGLRenderTarget | null = null;
  private rtAO: THREE.WebGLRenderTarget | null = null;
  private nW = 0;
  private nH = 0;
  private aoW = 0;
  private aoH = 0;
  private readonly clear = new THREE.Color();
  private readonly buf = new THREE.Vector2();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.aoScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.aoMat));
    this.aoBlurScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.aoBlurMat));
  }

  /** Occlusion sampling radius (world units), depth bias, and how dark the blurred occlusion lands (Task 19 looks). */
  set(o: { radius: number; bias: number; strength: number }): void {
    this.aoMat.uniforms.radius.value = o.radius;
    this.aoMat.uniforms.bias.value = o.bias;
    this.aoBlurMat.uniforms.strength.value = o.strength;
  }

  private normalMatFor(side: THREE.Side): THREE.MeshNormalMaterial {
    return (this.normalMats[side] ??= Object.assign(new THREE.MeshNormalMaterial({ side }), { toneMapped: false }));
  }

  /** Legacy ensureTargets, normal+depth target only: supersampled 2x (1.5x on hi-dpi), capped by max texture size. */
  private ensureTargets(): void {
    const buf = this.renderer.getDrawingBufferSize(this.buf);
    const dpr = this.renderer.getPixelRatio(), max = this.renderer.capabilities.maxTextureSize || 4096;
    let ss = dpr < 1.5 ? 2 : 1.5;
    ss = Math.min(ss, max / buf.x, max / buf.y);
    const w = Math.round(buf.x * ss), h = Math.round(buf.y * ss);
    if (this.rtN && this.nW === w && this.nH === h) return;
    if (this.rtN) {
      this.rtN.depthTexture?.dispose();
      this.rtN.dispose();
    }
    const rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
    });
    rt.depthTexture = new THREE.DepthTexture(w, h);
    rt.depthTexture.type = THREE.UnsignedIntType;
    this.rtN = rt;
    this.nW = w;
    this.nH = h;
  }

  private ensureAO(): void {
    const buf = this.renderer.getDrawingBufferSize(this.buf);
    const w = Math.max(1, Math.round(buf.x / 2)), h = Math.max(1, Math.round(buf.y / 2));
    if (this.rtAO && this.aoW === w && this.aoH === h) return;
    this.rtAO?.dispose();
    this.rtAO = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
    });
    this.aoW = w;
    this.aoH = h;
    this.aoBlurMat.uniforms.texel.value.set(1 / w, 1 / h);
  }

  /** Legacy renderReal: normals+depth, half-res occlusion, the lit product, then the blurred occlusion on top. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const renderer = this.renderer;
    this.ensureTargets();
    this.ensureAO();
    const rtN = this.rtN!, rtAO = this.rtAO!;
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const orig = meshes.map((o) => o.material as THREE.Material), vis = meshes.map((o) => o.visible);
    renderer.getClearColor(this.clear);
    const clearA = renderer.getClearAlpha();
    // 1) normals + depth of opaque parts
    renderer.setClearColor(0x000000, 1);
    meshes.forEach((o, i) => {
      if (orig[i].transparent || o.userData.isSticker) o.visible = false;
      else o.material = (o as THREE.InstancedMesh).isInstancedMesh ? this.flatNormalMat : this.normalMatFor(orig[i].side);
    });
    renderer.setRenderTarget(rtN);
    renderer.clear();
    renderer.render(scene, camera);
    meshes.forEach((o, i) => {
      o.material = orig[i];
      o.visible = vis[i];
    });
    // 2) occlusion at half resolution
    const u = this.aoMat.uniforms;
    u.tN.value = rtN.texture;
    u.tD.value = rtN.depthTexture;
    u.proj.value.copy(camera.projectionMatrix);
    u.invProj.value.copy(camera.projectionMatrixInverse);
    renderer.setRenderTarget(rtAO);
    renderer.render(this.aoScene, this.quadCam);
    // 3) the lit product, then the blurred occlusion multiplied on top
    renderer.setRenderTarget(null);
    renderer.setClearColor(this.clear, clearA);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    this.aoBlurMat.uniforms.tAO.value = rtAO.texture;
    renderer.autoClear = false;
    renderer.render(this.aoBlurScene, this.quadCam);
    renderer.autoClear = true;
  }
}
