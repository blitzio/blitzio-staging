const fs=require('node:fs');
const repository=process.env.GITHUB_REPOSITORY||'';
const [owner,name,...extra]=repository.split('/');
if(extra.length||!owner||!name||!/^[A-Za-z0-9-]+$/.test(owner)||!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name))throw new Error('Expected GITHUB_REPOSITORY=owner/repository.');
const site=`https://${owner.toLowerCase()}.github.io`;
const base=name.toLowerCase()===`${owner.toLowerCase()}.github.io`?'/':`/${name}/`;
if(process.argv.includes('--github-env')){
 if(!process.env.GITHUB_ENV)throw new Error('GITHUB_ENV is required.');
 fs.appendFileSync(process.env.GITHUB_ENV,`PAGES_SITE=${site}\nPAGES_BASE=${base}\n`);
}
console.log(JSON.stringify({site,base}));
