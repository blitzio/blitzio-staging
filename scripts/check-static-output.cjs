const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'dist');
const files=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>{const filename=path.join(directory,e.name);assert.ok(!fs.lstatSync(filename).isSymbolicLink());return e.isDirectory()?files(filename):[path.relative(root,filename).split(path.sep).join('/')];});
const expected=['index.html','favicon.svg','favicon.ico','apple-touch-icon.png','image-sources.txt','third-party-licenses.txt','fonts/DM-Sans-OFL.txt','fonts/dm-sans-latin-variable.woff2','images/astronaut.webp','images/earth-cap.webp','images/earth-night.webp','images/horizon.webp','images/horizon-night.webp','images/share-card.jpg'];
const found=files(root);assert.equal(found.length,expected.length+2);
assert.deepEqual(found.filter(p=>!p.startsWith('_astro/')).sort(),expected.sort());
assert.equal(found.filter(p=>/^_astro\/[\w.-]+\.js$/.test(p)).length,2);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(/name="robots" content="noindex, nofollow"/.test(html));
const base=process.env.PAGES_BASE||'/';
for(const asset of ['images/astronaut.webp','images/horizon.webp','images/horizon-night.webp','fonts/dm-sans-latin-variable.woff2','favicon.ico','apple-touch-icon.png'])assert.ok(html.includes(base+asset),`Missing based asset: ${asset}`);
assert.ok(!fs.existsSync(path.join(root,'CNAME')));
console.log(JSON.stringify({passed:true,files:found.length,bytes:found.reduce((n,p)=>n+fs.statSync(path.join(root,p)).size,0),base}));
// The link preview image must point at this site's own address.
if(process.env.PAGES_SITE)assert.ok(html.includes(`content="${process.env.PAGES_SITE}${base}images/share-card.jpg"`),'Share card URL points at this site');
