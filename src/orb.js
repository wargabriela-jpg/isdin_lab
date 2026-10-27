/*
 * ISDIN LAB optical sculpture: closed 3D silk belts, analytic normals,
 * procedural studio reflections, thin-film interference and restrained HDR bloom.
 * Everything is generated locally in WebGL; no images or network assets.
 */
(function () {
  'use strict';
  const quadVertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
  const optics = `
    const float TAU=6.28318530718;
    vec3 linearColor(vec3 c){return pow(max(c,vec3(0.0)),vec3(2.2));}
    vec3 film(float x){
      vec3 blue=vec3(.475,.725,1.0), cyan=vec3(.655,.961,.949);
      vec3 lavender=vec3(.890,.725,.961), pink=vec3(.973,.776,.910), pearl=vec3(1.0,.965,.914);
      float t=fract(x)*5.0;
      if(t<1.0)return linearColor(mix(blue,cyan,smoothstep(0.0,1.0,t)));
      if(t<2.0)return linearColor(mix(cyan,pearl,smoothstep(1.0,2.0,t)));
      if(t<3.0)return linearColor(mix(pearl,pink,smoothstep(2.0,3.0,t)));
      if(t<4.0)return linearColor(mix(pink,lavender,smoothstep(3.0,4.0,t)));
      return linearColor(mix(lavender,blue,smoothstep(4.0,5.0,t)));
    }
    // A continuous, curved studio strip: no intersecting point lights or stars.
    vec3 studio(vec3 r){
      float a=atan(r.z,r.x);
      float curve=.36+.19*sin(a*2.0+.4);
      float strip=exp(-pow((r.y-curve)/.105,2.0));
      float soft=exp(-pow((r.y+.45)/.32,2.0));
      float window=exp(-pow((a-1.5)/.55,2.0))*exp(-pow((r.y-.2)/.7,2.0));
      vec3 ambience=mix(vec3(.13,.28,.48),vec3(.40,.61,.83),r.y*.5+.5);
      return ambience+vec3(1.0,.98,.94)*strip*2.8
        +vec3(.47,.84,1.0)*soft*.36+vec3(.90,.78,1.0)*window*.72;
    }
    // Radial lobe field and its analytic gradient on the unit sphere.
    vec4 shellField(vec3 n,float time,float flow,float drive,float bass,float motion,float attack){
      float a=.55*sin(time*.18+flow*.65);
      float b=.40*cos(time*.15+flow*.47+1.1);
      float c=.28*sin(time*.13+flow*.58+2.0);
      float h=a*2.0*n.x*n.y+b*(n.x*n.x-n.y*n.y)+c*2.0*n.y*n.z;
      vec3 gradient=vec3(2.0*a*n.y+2.0*b*n.x,2.0*a*n.x-2.0*b*n.y+2.0*c*n.z,2.0*c*n.y);
      float strength=(.002+.073*drive+.010*bass+.004*attack)*min(motion,1.2);
      return vec4(strength*gradient,1.0+strength*h);
    }
    mat3 turnZ(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}
    mat3 turnX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
  `;
  const beltVertex = `
    uniform float uTime,uFlow,uVoice,uBass,uAttack,uSeed,uRadius,uWidth,uBaseAmp,uLatitude,uMotion,uMid,uEnvelope,uCalibration,uBiology,uEra,uProtocols;
    uniform sampler2D uPropagation;
    varying vec4 vPropagation;
    varying vec2 vUv; varying vec3 vNormal,vPosition;
    ${optics}
    // A causal history of the real analyser, sampled by 3D radius (0.42 s/unit).
    vec4 historyTap(float i){return texture2D(uPropagation,vec2((clamp(i,0.0,63.0)+.5)/64.0,.5));}
    vec4 propagated(float radius,out vec4 slope){
      float x=clamp(radius*.42/.60,0.0,1.0)*63.0;
      float i=floor(x),f=fract(x);
      vec4 a=historyTap(i-1.0),b=historyTap(i),c=historyTap(i+1.0),d=historyTap(i+2.0);
      vec4 c1=(c-a)*.5,c2=a-2.5*b+2.0*c-.5*d,c3=-.5*a+1.5*b-1.5*c+.5*d;
      vec4 value=b+f*(c1+f*(c2+f*c3));
      slope=(c1+f*(2.0*c2+3.0*f*c3))*(63.0*.42/.60);
      slope*=step(vec4(0.0),value)*step(value,vec4(1.0));
      return clamp(value,0.0,1.0);
    }
    mat3 turnZDerivative(float a){float c=cos(a),s=sin(a);return mat3(-s,c,0.,-c,-s,0.,0.,0.,0.);}
    mat3 turnXDerivative(float a){float c=cos(a),s=sin(a);return mat3(0.,0.,0.,0.,-s,c,0.,-c,-s);}
    void main(){
      vUv=uv;
      float u=uv.x*TAU, v=uv.y*2.0-1.0;
      float phase=uSeed+uTime*.115+uFlow*(.82+.12*sin(uSeed));
      float voiceFactor=uLatitude>.5?.22:1.0;
      // The rest-space point is radius*q, with |q|=1: this is its exact
      // Euclidean distance to (0,0,0), independent of camera or screen position.
      float restRadius=uRadius+.018*sin(3.0*u+phase)-.075*v*v;
      float restU=.054*cos(3.0*u+phase),restV=-.15*v;
      vec4 radialSlope;
      vec4 signal=propagated(restRadius,radialSlope);
      vPropagation=signal;
      float strength=min(uMotion,1.2)*voiceFactor;
      float voice=signal.r*strength;
      float mid=sqrt(signal.g)*strength;
      float voiceR=radialSlope.r*strength;
      float midR=signal.g>.00001?.5*radialSlope.g/sqrt(signal.g)*strength:0.0;
      float voiceU=voiceR*restU,voiceV=voiceR*restV;
      float midU=midR*restU,midV=midR*restV;
      float amp=uBaseAmp+.028*sin(uTime*.23+uSeed)*uMotion+.20*mid+.10*voice+.035*uCalibration+.025*uProtocols;
      float wave=2.0*u+phase;
      float widthWave=2.0*u-uFlow*.9+uSeed;
      float width=uWidth*(1.0+.16*cos(u+uSeed)+.46*voice+.18*voice*sin(widthWave));
      float widthU=uWidth*(-.16*sin(u+uSeed)+.36*voice*cos(widthWave));
      float third=3.0*u+uSeed-uTime*.10-uFlow*1.15;
      float thirdAmp=.065+.018*uBiology+.12*voice;
      float first=u-uFlow*.65+uSeed;
      float beta=uLatitude+amp*sin(wave)+v*width+thirdAmp*sin(third)+.10*voice*sin(first);
      float bu=2.0*amp*cos(wave)+v*widthU+3.0*thirdAmp*cos(third)+.10*voice*cos(first);
      float betaVoice=.10*sin(wave)+v*uWidth*(.46+.18*sin(widthWave))+.12*sin(third)+.10*sin(first);
      float betaMid=.20*sin(wave);
      bu+=betaVoice*voiceU+betaMid*midU;
      float bv=width+betaVoice*voiceV+betaMid*midV;
      // Smoothly compress only extreme latitudes; resting geometry is unchanged.
      if(abs(beta)>1.30){
        float compression=exp(-(abs(beta)-1.30)/.16);
        beta=sign(beta)*(1.30+.16*(1.0-compression));bu*=compression;bv*=compression;
      }
      float radius=uRadius+.018*sin(3.0*u+phase)-.075*v*v;
      radius+=(uRadius>.93?.002:.010)*uProtocols;
      float radialVoice=uRadius>.93?.008:.055;
      radius+=radialVoice*voice*sin(2.0*u+phase);
      float ru=.054*cos(3.0*u+phase)+2.0*radialVoice*voice*cos(2.0*u+phase);
      ru+=radialVoice*sin(2.0*u+phase)*voiceU;
      float rv=-.15*v+radialVoice*sin(2.0*u+phase)*voiceV;
      float sb=sin(beta),cb=cos(beta),su=sin(u),cu=cos(u);
      vec3 q=vec3(cb*cu,sb,cb*su);
      vec3 qb=vec3(-sb*cu,cb,-sb*su);
      vec3 qu=vec3(-cb*su,0.0,cb*cu);
      vec3 tu=ru*q+radius*(bu*qb+qu);
      vec3 tv=rv*q+radius*bv*qb;
      float zVoice=.15*sin(uFlow*.70+uSeed),xVoice=.23*cos(uFlow*.55+uSeed);
      float zAngle=.18-.18*uSeed+.035*sin(uTime*.08+uSeed)+.035*uEra+zVoice*voice;
      float xAngle=.24*sin(uSeed+.7)+.025*sin(uTime*.07)+xVoice*voice;
      mat3 rotation=turnZ(zAngle)*turnX(xAngle);
      mat3 rotationVoice=zVoice*turnZDerivative(zAngle)*turnX(xAngle)
        +xVoice*turnZ(zAngle)*turnXDerivative(xAngle);
      vec3 direction=rotation*q;
      vec3 basePosition=rotation*(radius*q);
      vec4 shell=shellField(direction,uTime,uFlow,uVoice,uBass,uMotion,uAttack);
      float shellU=dot(shell.xyz,rotation*(bu*qb+qu)+rotationVoice*q*voiceU);
      float shellV=dot(shell.xyz,rotation*(bv*qb)+rotationVoice*q*voiceV);
      vec3 p=basePosition*shell.w;
      vec3 tangent=(rotation*tu+rotationVoice*(radius*q)*voiceU)*shell.w+basePosition*shellU;
      vec3 bitangent=(rotation*tv+rotationVoice*(radius*q)*voiceV)*shell.w+basePosition*shellV;
      vPosition=p;
      vNormal=normalize(normalMatrix*normalize(cross(tangent,bitangent)));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }
  `;
  const beltFragment = `
    uniform float uTime,uSeed,uBrightness,uEnvelope,uTreble,uAttack,uPulse,uWelcome,uEra,uReprogram,uHighlight,uLayerAlpha;
    varying vec4 vPropagation;
    // Existing optical equations, driven by the same travelling local signal.
    #define uEnvelope vPropagation.b
    #define uAttack vPropagation.a
    varying vec2 vUv; varying vec3 vNormal,vPosition;
    ${optics}
    float line(float p,float at,float width){return exp(-pow((p-at)/width,2.0));}
    // Cool only the internal film; preserve the glass shell and ISDIN palette.
    vec3 internalFilm(float phase){
      vec3 c=film(phase);
      float rose=smoothstep(.02,.18,c.r-c.g);
      return mix(c,linearColor(vec3(.55,.78,1.0)),.08+.28*rose);
    }
    void main(){
      vec3 n=normalize(vNormal);if(n.z<0.0)n=-n;
      float nv=clamp(n.z,0.0,1.0);
      float fresnel=.025+.975*pow(1.0-nv,4.0);
      float u=vUv.x*TAU;
      vec3 reflected=reflect(vec3(0.0,0.0,-1.0),n);
      vec3 incoming=studio(reflected);
      float energy=max(incoming.r,max(incoming.g,incoming.b));
      float phase=.18+.17*uSeed+.24*sin(u+uSeed)+.50*(1.0-nv)+.11*sin(vUv.y*TAU+u+uSeed)+uTime*.030+uTreble*.080;
      vec3 iridescence=internalFilm(phase);
      float aquaAccent=pow(.5+.5*sin(u+uSeed+uTime*.04),8.0)
        *(.04+.14*uEnvelope)*(.35+.65*fresnel);
      iridescence=mix(iridescence,linearColor(vec3(.63,.94,.83)),aquaAccent);
      // Fine contour bundles belong to the silk surface and share its deformation.
      float contours=pow(1.0-nv,5.4)+line(vUv.y,.08,.004)*.10;
      float softEdge=pow(1.0-nv,3.0);
      float depth=smoothstep(-.8,.65,vPosition.z);
      float membrane=.29+.14*(1.0-nv);
      float fold=exp(-pow((cos(vUv.y*TAU)-.2)/.35,2.0));
      float lit=smoothstep(.8,2.5,energy);
      vec3 transmission=linearColor(vec3(.22,.52,.88));
      vec3 color=transmission*.55+iridescence*.32;
      color+=incoming*mix(vec3(.8,.88,1.0),iridescence,.48)*(.08+.70*fresnel+.10*uEnvelope*fresnel);
      color+=iridescence*(contours*2.5+softEdge*.85)*(1.0+lit*.45);
      vec3 foldColor=internalFilm(.48+.30*sin(u+.6)+cos(vUv.y*TAU)*.18+uTime*.006);
      color+=(foldColor*1.45+vec3(.12,.15,.17))*fold;
      color+=vec3(1.0,.98,.96)*contours*(.55+lit*.58);
      float vocal=.20*uAttack+.42*uEnvelope+.15*uTreble+.23*uPulse+.07*uWelcome+.10*uReprogram;
      // A restrained central optical emphasis, using the existing surfaces only.
      color*=1.0+.06*exp(-dot(vPosition.xy,vPosition.xy)*3.0);
      color*=.68+uBrightness*.72+vocal;
      float alpha=membrane+fresnel*.38+lit*.26+fold*.09+softEdge*.19+min(contours,1.0)*.32;
      alpha*=.80+uBrightness*.18+uEra*.06;
      alpha*=.32+.68*depth;
      if(uHighlight>.5){
        vec3 glow=mix(iridescence,vec3(1.0,.99,.97),.12)*contours*1.85;
        glow+=mix(foldColor,vec3(1.0,.99,.97),.12)*fold*.65;
        glow*=.55+uBrightness*.8+vocal*1.25;
        gl_FragColor=vec4(glow,(.22+.58*depth)*uLayerAlpha);
      }else gl_FragColor=vec4(color,clamp(alpha,.04,.83)*uLayerAlpha);
    }
  `;
  const glassVertex = `
    uniform float uTime,uFlow,uVoice,uBass,uMotion,uAttack;
    varying vec3 vNormal,vPosition;
    ${optics}
    void main(){
      vec3 n=normalize(position);
      vec4 field=shellField(n,uTime,uFlow,uVoice,uBass,uMotion,uAttack);
      vec3 tangentGradient=field.xyz-dot(field.xyz,n)*n;
      vec3 deformedNormal=normalize(n-tangentGradient/field.w);
      vec3 p=position*field.w;
      vNormal=normalize(normalMatrix*deformedNormal);vPosition=p;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }
  `;
  const glassFragment = `
    uniform float uTime,uBrightness,uTreble,uPulse,uWelcome,uBack;
    #ifdef FRONT_GLASS
      uniform sampler2D uInterior;
      uniform vec2 uResolution;
    #endif
    varying vec3 vNormal,vPosition;
    ${optics}
    void main(){
      vec3 n=normalize(vNormal);float face=abs(n.z);
      float fresnel=pow(1.0-face,3.0);
      float angle=atan(vPosition.y,vPosition.x);
      float phase=angle/TAU+.52+uTime*.009+uTreble*.06;
      vec3 iridescence=film(phase);
      vec3 reflected=studio(reflect(vec3(0.,0.,-1.),n));
      float ring=exp(-pow((face-.115)/.037,2.0));
      float inner=exp(-pow((face-.255)/.022,2.0))*(.5+.5*sin(angle*2.0+.8));
      #ifdef FRONT_GLASS
        // Refract the actual 3D interior. Dispersion splits the RGB ray offsets.
        vec2 uv=gl_FragCoord.xy/uResolution;
        vec2 bend=n.xy*vec2(uResolution.y/uResolution.x,1.0)*(.006+.026*pow(1.0-face,1.5));
        vec3 transmitted=vec3(texture2D(uInterior,uv-bend*1.035).r,
          texture2D(uInterior,uv-bend).g,texture2D(uInterior,uv-bend*.965).b);
        transmitted=mix(texture2D(uInterior,uv-bend).rgb,transmitted,.20);
        vec3 reflection=reflected*mix(vec3(.90,.96,1.0),iridescence,.55);
        vec3 color=transmitted*(.985-.055*fresnel)+reflection*(.020+.28*fresnel);
        color+=mix(iridescence,vec3(1.0),.34)*(ring*1.55+inner*.45);
        color+=iridescence*inner*.55;
        gl_FragColor=vec4(color,1.0);
      #else
        float chord=2.0*face;
        vec3 transmitted=linearColor(vec3(.48,.70,.96))*exp(-vec3(.22,.10,.02)*chord);
        vec3 color=transmitted+iridescence*fresnel*.35+reflected*.022;
        gl_FragColor=vec4(color,.49+.22*face);
      #endif
    }
  `;
  const blurFragment = `
    uniform sampler2D uInput;uniform vec2 uStep;uniform float uExtract;
    varying vec2 vUv;
    vec3 readLight(vec2 uv){vec3 c=texture2D(uInput,uv).rgb;return uExtract>.5?max(c-vec3(1.05),vec3(0.0)):c;}
    void main(){
      vec3 c=readLight(vUv)*.227027;
      c+=(readLight(vUv+uStep*1.384615)+readLight(vUv-uStep*1.384615))*.316216;
      c+=(readLight(vUv+uStep*3.230769)+readLight(vUv-uStep*3.230769))*.070270;
      gl_FragColor=vec4(c,1.0);
    }
  `;

  class OrbRenderer {
    constructor(canvas){
      if(!window.THREE)throw new Error('No se ha podido cargar Three.js desde vendor/.');
      const T=window.THREE;this.canvas=canvas;
      this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
      this.renderer.setClearColor(0xe4effc,1);this.renderer.outputColorSpace=T.SRGBColorSpace;
      this.scene=new T.Scene();this.camera=new T.OrthographicCamera(-4,4,2.222222,-2.222222,.1,30);this.camera.position.z=7;
      this.uniforms={};
      for(const n of ['Time','Flow','Voice','Motion','Mid','Bass','Envelope','Calibration','Biology','Protocols','Era','Brightness','Treble','Attack','Pulse','Welcome','Reprogram'])this.uniforms['u'+n]={value:0};
      this.uniforms.uBrightness.value=1;
      this._propagationTime=0;this._propagationSamples=[];
      this._propagationData=new Float32Array(64*4);
      this._propagationTexture=new T.DataTexture(this._propagationData,64,1,T.RGBAFormat,T.FloatType);
      this._propagationTexture.minFilter=T.NearestFilter;this._propagationTexture.magFilter=T.NearestFilter;
      this._propagationTexture.generateMipmaps=false;this._propagationTexture.needsUpdate=true;
      this.uniforms.uPropagation={value:this._propagationTexture};
      this.voiceResponse=new VoiceResponse();
      const backgroundMaterial=new T.ShaderMaterial({depthWrite:false,depthTest:false,uniforms:{uAspect:{value:16/9}},
        vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader:`varying vec2 vUv;uniform float uAspect;void main(){
          vec2 p=(vUv-.5)*vec2(uAspect,1.0);
          float wash=exp(-dot(p-vec2(-.18,.15),p-vec2(-.18,.15))*1.5);
          vec3 c=mix(vec3(.75,.855,.975),vec3(.89,.947,1.),wash*.85);
          gl_FragColor=vec4(pow(c,vec3(2.2)),1.0);
        }`});
      this.background=new T.Mesh(new T.PlaneGeometry(2,2),backgroundMaterial);this.background.position.z=-4;this.background.renderOrder=-10;this.scene.add(this.background);
      this.orb=new T.Group();this.orb.rotation.z=.05;this.scene.add(this.orb);
      const sphere=new T.SphereGeometry(1,128,80);
      for(const back of [true,false]){
        const mesh=new T.Mesh(sphere,new T.ShaderMaterial({uniforms:{...this.uniforms,uBack:{value:back?1:0}},vertexShader:glassVertex,fragmentShader:glassFragment,
          defines:back?{}:{FRONT_GLASS:1},transparent:back,depthWrite:false,side:back?T.BackSide:T.FrontSide}));
        if(!back){mesh.layers.set(1);this.frontGlass=mesh;}
        mesh.renderOrder=back?0:20;this.orb.add(mesh);
      }
      const geometry=new T.PlaneGeometry(1,1,192,60);
      const belts=[
        {phase:.28,radius:.875,width:.30,amp:.66,latitude:0,alpha:1},
        {phase:1.8,radius:.84,width:.245,amp:.66,latitude:0,alpha:1},
        {phase:3.05,radius:.73,width:.15,amp:.53,latitude:-.08,alpha:.72},
        {phase:3.4,radius:.955,width:.045,amp:.13,latitude:.90,alpha:.75}
      ];
      belts.forEach((belt,i)=>{
        const mesh=new T.Mesh(geometry,new T.ShaderMaterial({uniforms:{...this.uniforms,uSeed:{value:belt.phase},uRadius:{value:belt.radius},uWidth:{value:belt.width},uHighlight:{value:0},uBaseAmp:{value:belt.amp},uLatitude:{value:belt.latitude},uLayerAlpha:{value:belt.alpha}},
          vertexShader:beltVertex,fragmentShader:beltFragment,side:T.DoubleSide,transparent:true,depthWrite:false}));
        mesh.frustumCulled=false;mesh.renderOrder=2+i;this.orb.add(mesh);
        const highlightMaterial=mesh.material.clone();
        // Share animation features; only the optical pass differs.
        highlightMaterial.uniforms={...mesh.material.uniforms,uHighlight:{value:1}};
        highlightMaterial.blending=T.AdditiveBlending;highlightMaterial.forceSinglePass=true;
        const highlights=new T.Mesh(geometry,highlightMaterial);
        highlights.frustumCulled=false;highlights.renderOrder=10+i;this.orb.add(highlights);
      });
      this.hdr=this.renderer.capabilities.isWebGL2&&this.renderer.extensions.has('EXT_color_buffer_float');
      const options={type:this.hdr?T.HalfFloatType:T.UnsignedByteType,format:T.RGBAFormat,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true};
      this.sceneTarget=new T.WebGLRenderTarget(2,2,options);
      this.refractionTarget=new T.WebGLRenderTarget(2,2,options);
      this.frontGlass.material.uniforms.uInterior={value:this.sceneTarget.texture};
      this.frontGlass.material.uniforms.uResolution={value:new T.Vector2(2,2)};
      const gl=this.renderer.getContext();
      const sampleCounts=this.renderer.capabilities.isWebGL2
        ?Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,this.hdr?gl.RGBA16F:gl.RGBA8,gl.SAMPLES)||[]):[];
      const supported=sampleCounts.filter(n=>n>0&&n<=4);
      this.sceneTarget.samples=supported.length?Math.min(...supported):0;
      this.blurA=new T.WebGLRenderTarget(2,2,{...options,depthBuffer:false});
      this.blurB=new T.WebGLRenderTarget(2,2,{...options,depthBuffer:false});
      this.postScene=new T.Scene();this.postCamera=new T.Camera();
      this.quad=new T.Mesh(new T.PlaneGeometry(2,2));this.quad.frustumCulled=false;this.postScene.add(this.quad);
      this.copyMaterial=new T.ShaderMaterial({vertexShader:quadVertex,depthTest:false,depthWrite:false,
        uniforms:{uInput:{value:this.sceneTarget.texture}},
        fragmentShader:'varying vec2 vUv;uniform sampler2D uInput;void main(){gl_FragColor=texture2D(uInput,vUv);}'});
      this.blurMaterial=new T.ShaderMaterial({vertexShader:quadVertex,fragmentShader:blurFragment,depthTest:false,depthWrite:false,
        uniforms:{uInput:{value:null},uStep:{value:new T.Vector2()},uExtract:{value:0}}});
      this.compositeMaterial=new T.ShaderMaterial({vertexShader:quadVertex,depthTest:false,depthWrite:false,
        uniforms:{uScene:{value:this.refractionTarget.texture},uBloom:{value:this.blurB.texture},uBloomStrength:{value:.16}},
        fragmentShader:`varying vec2 vUv;uniform sampler2D uScene,uBloom;uniform float uBloomStrength;
          void main(){vec3 c=texture2D(uScene,vUv).rgb+texture2D(uBloom,vUv).rgb*uBloomStrength;
          float peak=max(c.r,max(c.g,c.b));c/=max(1.0,peak);
          gl_FragColor=vec4(pow(max(c,vec3(0.0)),vec3(1.0/2.2)),1.0);}`});
      this.quality=1;this.exporting=false;this.organicTime=0;this.voiceFlow=0;this.voiceDrive=0;this.fps=60;this._frameTotal=0;this._frameCount=0;this._qualityWindow=0;
      this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas.parentElement);
    }
    resize(){
      if(this.exporting)return;const rect=this.canvas.parentElement.getBoundingClientRect();
      const width=Math.max(2,Math.round(Math.min(1920,Math.max(1,rect.width)*Math.min(window.devicePixelRatio||1,2))*this.quality));
      this.setSize(width,Math.round(width*9/16));
    }
    setSize(w,h){
      this.renderer.setSize(w,h,false);const aspect=w/h;
      this.camera.left=-2.222222*aspect;this.camera.right=2.222222*aspect;this.camera.updateProjectionMatrix();
      this.background.scale.set(2.222222*aspect,2.222222,1);this.background.material.uniforms.uAspect.value=aspect;
      this.sceneTarget.setSize(w,h);this.refractionTarget.setSize(w,h);this.frontGlass.material.uniforms.uResolution.value.set(w,h);this.blurA.setSize(Math.max(2,Math.round(w/4)),Math.max(2,Math.round(h/4)));this.blurB.setSize(this.blurA.width,this.blurA.height);
      this.ensureFramebuffer();this.draw();
    }
    ensureFramebuffer(){
      const r=this.renderer,gl=r.getContext();
      const complete=target=>{r.setRenderTarget(target);return gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;};
      if(!complete(this.sceneTarget)){
        this.sceneTarget.dispose();this.sceneTarget.samples=0;
        if(!complete(this.sceneTarget)){
          this.hdr=false;
          for(const target of [this.sceneTarget,this.refractionTarget,this.blurA,this.blurB]){target.dispose();target.texture.type=THREE.UnsignedByteType;}
          if(!complete(this.sceneTarget))throw new Error('No se pudo crear el framebuffer WebGL.');
        }
      }
      if(!complete(this.refractionTarget)||!complete(this.blurA)||!complete(this.blurB))throw new Error('No se pudo crear el framebuffer de reflejos.');
      r.setRenderTarget(null);
    }
    draw(){
      const r=this.renderer;this.camera.layers.set(0);r.setRenderTarget(this.sceneTarget);r.render(this.scene,this.camera);
      this.quad.material=this.copyMaterial;r.setRenderTarget(this.refractionTarget);r.render(this.postScene,this.postCamera);
      this.camera.layers.set(1);r.autoClear=false;r.render(this.scene,this.camera);r.autoClear=true;this.camera.layers.set(0);
      this.quad.material=this.blurMaterial;const u=this.blurMaterial.uniforms;
      u.uInput.value=this.refractionTarget.texture;u.uStep.value.set(2/this.canvas.width,0);u.uExtract.value=1;
      r.setRenderTarget(this.blurA);r.render(this.postScene,this.postCamera);
      u.uInput.value=this.blurA.texture;u.uStep.value.set(0,1/this.blurA.height);u.uExtract.value=0;
      r.setRenderTarget(this.blurB);r.render(this.postScene,this.postCamera);
      this.quad.material=this.compositeMaterial;r.setRenderTarget(null);r.render(this.postScene,this.postCamera);
    }
    beginExport(){this.exporting=true;this.setSize(1920,1080);}
    endExport(){this.exporting=false;this.resize();}
    updatePropagation(dt,state){
      // Resample by elapsed time, not frame count. The delay remains constant at
      // different frame rates; retained samples also let a phrase dissipate.
      this._propagationTime+=dt;
      const time=this._propagationTime;
      const values=[state.drive,state.mid,state.envelope,state.attack].map(v=>Math.max(0,Math.min(1,v)));
      const samples=this._propagationSamples;
      if(!samples.length)samples.push({time:time-dt,values:[0,0,0,0]});
      samples.push({time,values});
      while(samples.length>2&&samples[1].time<time-.65)samples.shift();
      let index=samples.length-1;
      for(let bin=0;bin<64;bin++){
        const at=time-bin*.60/63;
        while(index>0&&samples[index].time>at)index--;
        const a=samples[index],b=samples[Math.min(index+1,samples.length-1)];
        const t=b.time>a.time?Math.max(0,Math.min(1,(at-a.time)/(b.time-a.time))):0;
        for(let c=0;c<4;c++)this._propagationData[bin*4+c]=at<samples[0].time?0:a.values[c]+(b.values[c]-a.values[c])*t;
      }
      this._propagationTexture.needsUpdate=true;
    }
    render(dt,audio,narrative,params){
      const step=Math.min(Math.max(dt,.001),.5);
      const response=this.voiceResponse.step(step,audio,audio.playing!==false);
      this.voiceDrive=response.drive;
      // Two-stage inertia: coherent deformation and optical response without steps.
      const motionStep=Math.min(step,.05);
      const state=this._motionState||(this._motionState={drive:0,flow:0,mid:0,bass:0,envelope:0,treble:0,attack:0,expand:0});
      const input=this._motionInput||(this._motionInput={});
      const follow=(key,target)=>{
        const previous=input[key]||0;
        const firstTau=target>previous?.12:.28;
        input[key]=previous+(target-previous)*(1-Math.exp(-motionStep/firstTau));
        const secondTau=input[key]>state[key]?.18:.48;
        state[key]+=(input[key]-state[key])*(1-Math.exp(-motionStep/secondTau));
      };
      follow('drive',response.drive);follow('flow',response.flowRate);
      follow('expand',response.expand);
      for(const key of ['mid','bass','envelope','treble','attack'])follow(key,(audio[key]||0)*response.drive);
      this.updatePropagation(step,state);
      this.voiceFlow+=motionStep*(.35+.25*state.flow)*params.motion*params.speed;
      this.organicTime+=motionStep*params.speed*(.40+.20*state.drive);
      const u=this.uniforms;
      u.uTime.value=this.organicTime;u.uFlow.value=this.voiceFlow;u.uVoice.value=state.drive;u.uMotion.value=params.motion;u.uBrightness.value=params.brightness;
      for(const key of ['mid','bass','envelope','treble','attack'])u['u'+key[0].toUpperCase()+key.slice(1)].value=state[key];
      for(const key of ['calibration','biology','protocols','era','pulse','welcome','reprogram'])u['u'+key[0].toUpperCase()+key.slice(1)].value=(narrative[key]||0)*response.drive;
      this.compositeMaterial.uniforms.uBloomStrength.value=this.hdr?(.14+params.brightness*.12):0;
      // Preserve the existing size range, with the same inertia as the internal bands.
      this.orb.scale.setScalar(params.size/45*(1+.22*state.expand));
      this.draw();
      if(Number.isFinite(dt)&&dt>0){const measured=Math.min(dt,10);this._frameTotal+=measured;this._frameCount++;this._qualityWindow+=measured;}
      if(this._qualityWindow>3){
        this.fps=this._frameCount/Math.max(.001,this._frameTotal);
        if(!this.exporting){const next=this.fps<48?Math.max(.55,this.quality*.85):this.fps>58?Math.min(1,this.quality+.04):this.quality;
          if(Math.abs(next-this.quality)>.015){this.quality=next;this.resize();}}
        this._frameTotal=0;this._frameCount=0;this._qualityWindow=0;
      }
    }
  }
  window.OrbRenderer=OrbRenderer;
}());
