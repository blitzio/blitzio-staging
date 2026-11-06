export const surfaceShader = `
varying vec3 vWorld; varying vec3 vNormal;
uniform sampler2D atlas; uniform vec3 sun; uniform vec3 center;
void main(){
 vec3 p=normalize(vWorld-center);
 vec3 image=texture2D(atlas,p.xz*.5+.5).rgb;
 float luminance=dot(image,vec3(.2126,.7152,.0722));
 float ocean=max(1.-smoothstep(.003,.015,luminance),smoothstep(.005,.035,image.b-max(image.r,image.g)));
 vec3 neutral=vec3(luminance*.63,luminance*.75,luminance*1.12);
 vec3 land=mix(image,neutral,.78);
 land*=mix(1.34,1.,smoothstep(.025,.15,luminance));
 land*=1.+.06*smoothstep(.006,.025,luminance)*(1.-smoothstep(.08,.20,luminance));
 vec3 sea=mix(vec3(.0025,.0085,.025),image*vec3(.46,.66,1.06),.32);
 vec3 base=mix(land,sea,ocean);
 vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);
 float day=smoothstep(-.1,.75,dot(n,sun));
 float specular=pow(max(dot(n,normalize(sun+v)),0.),110.)*ocean;
 vec3 illumination=mix(vec3(.085,.065,.16),vec3(.85,.88,1.03),day);
 vec3 color=base*illumination+vec3(.055,.095,.16)*specular*.14;
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
