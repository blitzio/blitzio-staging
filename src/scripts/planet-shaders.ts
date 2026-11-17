// Approved v1.1 grading. The day side keeps the v1 dark geographic treatment.
// The night side shows NASA night lights, and a violet twilight band marks
// the day/night line that the pointer drags across the cap.
export const surfaceShader = `
varying vec3 vWorld; varying vec3 vNormal;
uniform sampler2D atlas; uniform sampler2D night; uniform vec3 sun; uniform vec3 center; uniform vec3 lamp; uniform float edge; uniform float finish;
void main(){
 vec3 p=normalize(vWorld-center);
 // The images are uploaded top row first (as decoded bitmaps), so v runs down.
 vec2 uv=vec2(p.x*.5+.5,.5-p.z*.5);
 vec3 image=texture2D(atlas,uv).rgb;
 float luminance=dot(image,vec3(.2126,.7152,.0722));
 float ocean=max(1.-smoothstep(.003,.015,luminance),smoothstep(.005,.035,image.b-max(image.r,image.g)));
 vec3 neutral=vec3(luminance*.63,luminance*.75,luminance*1.12);
 vec3 land=mix(image,neutral,.78);
 land*=mix(1.34,1.,smoothstep(.025,.15,luminance));
 land*=1.+.06*smoothstep(.006,.025,luminance)*(1.-smoothstep(.08,.20,luminance));
 vec3 sea=mix(vec3(.0025,.0085,.025),image*vec3(.46,.66,1.06),.32);
 vec3 base=mix(land,sea,ocean);
 vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);
 float d=dot(n,sun);
 // Day, twilight and night lights are all centred on the same edge value,
 // so the visible day/night line is exactly where the scene aims it.
 float day=smoothstep(edge-.10,edge+.10,d);
 // finish scales the twilight glow and ocean glint. It is 1 on the site and
 // 0 only when a test needs the bare day/night shading.
 float specular=pow(max(dot(n,normalize(sun+v)),0.),70.)*ocean*day*finish;
 vec3 illumination=mix(vec3(.040,.033,.085),vec3(.85,.88,1.03),day);
 float band=exp(-abs(d-edge)*12.);
 vec3 twilight=vec3(.34,.20,.70)*band*finish;
 float glow=texture2D(night,uv).r;
 float darkness=1.-smoothstep(edge-.09,edge+.09,d);
 vec3 lights=lamp*(glow*1.25+glow*glow*2.5)*darkness;
 vec3 color=base*(illumination+twilight*.75)+vec3(.012,.008,.030)*band*finish+vec3(.055,.095,.16)*specular*.45+lights;
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export const atmosphereShader = `
varying vec3 vWorld; uniform vec3 sun; uniform vec3 center;
vec2 hit(vec3 o,vec3 d,float r){float b=dot(o,d),c=dot(o,o)-r*r,h=b*b-c;if(h<0.)return vec2(-1.);h=sqrt(h);return vec2(-b-h,-b+h);}
void main(){
 vec3 o=cameraPosition-center,d=normalize(vWorld-cameraPosition);
 vec2 air=hit(o,d,18.11),ground=hit(o,d,18.);
 float start=max(0.,air.x),end=air.y;
 if(ground.x>0.)end=min(end,ground.x);
 float stepSize=(end-start)/12., optical=0.;vec3 light=vec3(0.);
 for(int i=0;i<12;i++){
  vec3 q=o+d*(start+(float(i)+.5)*stepSize);
  float altitude=max(0.,length(q)-18.);
  float density=exp(-altitude/.018);
  float facing=dot(normalize(q),sun);
  float daylight=smoothstep(-.30,.45,facing);
  float dusk=exp(-abs(facing)*6.);
  optical+=density*stepSize;
  vec3 tint=mix(vec3(.25,.105,.43),vec3(.065,.30,.58),daylight);
  tint=mix(tint,vec3(.40,.20,.80),dusk*.6);
  light+=tint*density*stepSize*exp(-optical*.75)*(.15+daylight*1.8+dusk*1.1);
 }
 float forward=pow(max(dot(d,sun),0.),5.);
 light*=1.+forward*1.6;
 float opacity=clamp(length(light)*1.8,0.,.85);
 gl_FragColor=vec4(light*1.6,opacity);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
