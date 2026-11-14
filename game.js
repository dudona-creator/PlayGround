import * as THREE from 'three';

// NEON REBELLION — all gameplay is simulated in a live, collidable 3D world.
const canvas = document.querySelector('#game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090d16);
scene.fog = new THREE.FogExp2(0x090d16, 0.0085);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 420);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
scene.add(new THREE.HemisphereLight(0x91c7d6, 0x15121d, 1.15));
const moon = new THREE.DirectionalLight(0x9ab8e9, 1.35); moon.position.set(-35, 65, 20); moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); scene.add(moon);
const neonPink = new THREE.PointLight(0xff2865, 65, 34, 2); neonPink.position.set(-18, 8, 14); scene.add(neonPink);
const neonTeal = new THREE.PointLight(0x00d9d2, 55, 32, 2); neonTeal.position.set(17, 7, -15); scene.add(neonTeal);
const world = new THREE.Group(); scene.add(world);
const clock = new THREE.Clock();
const mats = {};
function mat(color, roughness=.78, metalness=.05, emissive=0x000000, intensity=0) { const key=[color,roughness,metalness,emissive,intensity].join(':'); return mats[key] ||= new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity:intensity}); }
function box(parent,x,y,z,sx,sy,sz,material,cast=true) { const o=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material); o.position.set(x,y,z); o.castShadow=cast; o.receiveShadow=true; parent.add(o); return o; }
function cylinder(parent,x,y,z,r1,r2,h,material,segments=8) { const o=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),material); o.position.set(x,y,z); o.castShadow=true; parent.add(o); return o; }
function sphere(parent,x,y,z,r,material,segments=10) { const o=new THREE.Mesh(new THREE.SphereGeometry(r,segments,8),material); o.position.set(x,y,z); o.castShadow=true; parent.add(o); return o; }
const groundMat=mat(0x171d24,.95), roadMat=mat(0x0d1219,.95), concrete=mat(0x252b31), darkConcrete=mat(0x151d26), glass=mat(0x253a48,.3,.55), pink=mat(0xff2e70,.36,.25,0xff1555,2.4), cyan=mat(0x1af1df,.35,.2,0x0acfc4,2.2), amber=mat(0xffb94d,.4,.15,0xd66a18,1.3), windowMat=mat(0x5c99a1,.28,.3,0x2a8793,.8), black=mat(0x090e14), metal=mat(0x58646c,.35,.7), suit=mat(0x202c36,.8,.2), jacket=mat(0x273945,.88,.05), redCloth=mat(0xc53254,.8,.05), skin=mat(0xb9856b), white=mat(0xd0dbdc,.5,.1,0x8db7bd,.2);
const blockers=[], interactables=[], pickups=[], enemies=[], projectiles=[], decor=[];
const player={pos:new THREE.Vector3(0,0,11),vel:new THREE.Vector3(),yaw:0,health:100,stamina:100,hunger:72,thirst:84,armor:0,ammo:12,reserve:36,energy:100,weapon:'SCRAP PISTOL',kills:0,hasRebirth:false,mission:0,dead:false,grounded:true,crouch:false};
let cameraYaw=0,cameraPitch=.19,aiming=false, firing=false, paused=true, gameStarted=false, elapsed=0, toastTimer=0, interactTarget=null, documentRead=false, checkpoint=null;
const keys={};
function makeTerrain(){
  box(world,0,-.7,0,220,1.4,220,groundMat,false);
  box(world,0,-.12,0,8,.25,220,roadMat,false);box(world,0,-.1,0,220,.25,8,roadMat,false);
  for(let i=-100;i<=100;i+=4){box(world,i,-.04,0,.08,.04,220,mat(0x29323a),false);box(world,0,-.04,i,220,.04,.08,mat(0x29323a),false)}
  for(let z=-100;z<=100;z+=28) for(let x=-100;x<=100;x+=28){if(Math.abs(x)<17||Math.abs(z)<17)continue;if(x<-22&&z<-18&&x>-78&&z>-76)continue;if(x>20&&z<-12&&x<80&&z>-78)continue;if(x<-20&&z>12&&x>-68&&z<64)continue;if(x>18&&z>16&&x<70&&z<78)continue;const width=13+Math.random()*9,depth=13+Math.random()*9; const h=12+Math.random()*36; const region=zoneFor(x,z);buildBuilding(x,z,width,depth,h,region);}
  // Long district-specific streets, wayfinding, barriers and safehouse markers.
  for(let x=-90;x<95;x+=17)streetLamp(x,5.5,9,x>18?cyan:pink);
  for(let z=-90;z<95;z+=18)streetLamp(9,5.5,z,cyan);
  makeMarket(); makeFactory(); makeNexus(); makeSubway();
  // World edge: invisible city perimeter walls keep traversal in-bounds.
  for(const [x,z,sx,sz] of [[0,-108,220,2],[0,108,220,2],[-108,0,2,220],[108,0,2,220]]){box(world,x,12,z,sx,24,sz,black,false);blockers.push({x:x-sx/2,z:z-sz/2,w:sx,d:sz});}
}
function zoneFor(x,z){if(x>22&&z<-18)return 'nexus';if(x<-22&&z<-18)return 'industrial';if(x>22&&z>18)return 'underground';return 'zero';}
function buildBuilding(x,z,w,d,h,region){
  const baseColor=region==='nexus'?0x1a2834:region==='industrial'?0x342d29:region==='underground'?0x1c2930:0x252a31;
  const body=mat(baseColor,.8,.25), trim=region==='nexus'?cyan:region==='industrial'?amber:region==='underground'?mat(0x42c7b8,.45,.2,0x087d71,1):pink;
  const g=new THREE.Group();g.position.set(x,0,z);world.add(g);
  box(g,0,h/2,0,w,h,d,body);box(g,0,h+.25,0,w+.7,.5,d+.7,concrete);
  const floors=Math.floor(h/3.2);for(let f=1;f<floors;f+=2){for(let side of [-1,1]){box(g,side*(w/2+.03),f*3,0,.12,.13,d*.84,trim,false);for(let k of [-1,1])box(g,side*(w/2+.08),f*3.8,k*d*.25,.06,1.35,d*.22,windowMat,false);}}
  for(let side of [-1,1])for(let n=-1;n<=1;n+=2){box(g,n*w*.27,h*.46,side*(d/2+.035),w*.22,.12,.07,trim,false);}
  if(region==='nexus'){box(g,0,h+1,0,w*.45,1.1,d*.45,black);cylinder(g,0,h+3,0,.2,.6,3,trim);}
  if(Math.random()<.24){box(g,0,h+2,0,3,.6,.35,trim,false);box(g,0,h+2.55,0,.08,.5,.08,trim,false)}
  blockers.push({x:x-w*.48,z:z-d*.48,w:w*.96,d:d*.96});
}
function streetLamp(x,y,z,material){const pole=cylinder(world,x,y/2,z,.09,.13,y,metal);cylinder(world,x,y,z,.35,.2,.4,material);const l=new THREE.PointLight(material===pink?0xff2865:0x10d7ce,12,16,2);l.position.set(x,y-.2,z);scene.add(l);}
function addBillboard(x,y,z,txt,color){const panel=box(world,x,y,z,8,2.1,.18,black,false);const sign=box(world,x,y,z-.11,7.6,1.55,.08,color,false);return sign;}
function makeMarket(){
  const g=new THREE.Group();g.position.set(-31,0,29);world.add(g);
  for(let i=0;i<5;i++){const x=-9+i*4.5;box(g,x,1.6,0,4,3.2,3,mat(i%2?0x26202b:0x1c2a2a));box(g,x,3.3,0,4.6,.25,3.5,i%2?pink:cyan);box(g,x,1.1,-1.62,3.2,1.2,.12,black);}
  for(let i=0;i<3;i++){cylinder(g,-8+i*8,2.6,-7,.15,.15,5,metal);sphere(g,-8+i*8,5.2,-7,.35,amber);}
  addBillboard(-31,9,21,'NIGHT MARKET',pink);
}
function makeFactory(){
  const g=new THREE.Group();g.position.set(-43,0,-42);world.add(g);
  for(let i=0;i<3;i++){box(g,-9+i*9,3,0,7,6,9,concrete);for(let j=0;j<3;j++)box(g,-11+i*9+j*2,7,0,.4,2,.4,metal);cylinder(g,-9+i*9,4,-5,1.2,1.2,7,metal);}
  for(let i=0;i<4;i++){cylinder(g,-13+i*8,1.4,8,1.5,1.5,2,mat(0x725031,.7,.2));}
  addBillboard(-43,12,-32,'SECTOR 09 // FOUNDRY',amber);
  // Toxic pools are visual and dangerous volumes.
  for(let i=0;i<4;i++){const x=-62+i*12,z=-37+(i%2)*14;const pool=new THREE.Mesh(new THREE.CircleGeometry(2.7,12),mat(0x67e477,.3,.1,0x28dd58,1));pool.rotation.x=-Math.PI/2;pool.position.set(x,.03,z);world.add(pool);decor.push({type:'toxic',x,z,r:2.7});}
}
function makeNexus(){
  // Secure compound sits within the corporate district's connected street grid.
  const g=new THREE.Group();g.position.set(48,0,-42);world.add(g);
  for(const [x,z,w,d,h] of [[0,-13,28,8,12],[-15,0,6,24,8],[15,0,6,24,8]])box(g,x,h/2,z,w,h,d,mat(0x182b3a,.38,.45));
  const tower=box(g,0,25,0,19,50,21,mat(0x233d4d,.27,.55));
  for(let y=5;y<49;y+=4){box(g,0,y,10.62,17,.22,.12,cyan,false);box(g,0,y,-10.62,17,.22,.12,cyan,false);}
  box(g,0,52,0,23,1,25,black);cylinder(g,0,56,0,.3,1.2,7,cyan);
  for(const [x,z] of [[-13,-15],[13,-15],[-13,15],[13,15]]){cylinder(g,x,2.2,z,.18,.18,4,metal);sphere(g,x,4.3,z,.32,pink);}
  addBillboard(48,15,-26,'NEXUS / ARC 01',cyan);
  // Keep the south approach open so the player can enter the compound.
  blockers.push({x:31,z:-56,w:34,d:2},{x:31,z:-54,w:2,d:26},{x:63,z:-54,w:2,d:26});
}
function makeSubway(){
  const x=34,z=36;box(world,x,-.3,z,19,.25,17,black,false);box(world,x,0,z+8,19,.7,1,concrete);box(world,x,0,z-8,19,.7,1,concrete);
  for(let i=-2;i<=2;i++){box(world,x+i*3,-1.4,z,1.4,2.6,1.5,metal);}
  // Entrances descend below the street; tunnel play area is built just below ground.
  for(let i=0;i<7;i++){const step=box(world,x, -.12-i*.18,z+5-i*.55,5,.24,.8,concrete);}
  const tunnelY=-2.2;box(world,x,tunnelY-1,z-8,8,1,46,roadMat,false);box(world,x,tunnelY+4,z-8,8,.5,46,darkConcrete,false);box(world,x-4,tunnelY+1.5,z-8,.4,5,46,concrete,false);box(world,x+4,tunnelY+1.5,z-8,.4,5,46,concrete,false);
  for(let i=0;i<6;i++){box(world,x,tunnelY+3,z-27+i*7,8,.25,.3,cyan,false);}
  addBillboard(x,5,z+10,'SUBWAY // ACCESS',cyan);
}

function limb(parent,x,y,z,length,radius,material){const pivot=new THREE.Group();pivot.position.set(x,y,z);parent.add(pivot);cylinder(pivot,0,-length/2,0,radius*.78,radius,length,material,7);sphere(pivot,0,-length,0,radius*.76,material,8);return pivot;}
function humanoid(parent,enemy=false){
  const root=new THREE.Group();parent.add(root);
  const clothes=enemy?mat(0x26323b,.45,.45):jacket, pants=enemy?mat(0x18202a,.72,.2):suit;
  const torso=box(root,0,1.34,0,.68,.78,.38,clothes);const belt=box(root,0,.91,0,.7,.12,.4,metal);
  box(root,0,1.78,-.01,.5,.18,.43,enemy?black:redCloth);
  const head=sphere(root,0,2.04,0,.23,skin,12);const hair=box(root,0,2.22,0,.38,.16,.37,black);const visor=box(root,0,2.04,.205,.28,.09,.04,enemy?pink:cyan);
  const leftArm=limb(root,-.43,1.62,0,.61,.12,clothes),rightArm=limb(root,.43,1.62,0,.61,.12,clothes);
  const leftLeg=limb(root,-.19,.86,0,.72,.15,pants),rightLeg=limb(root,.19,.86,0,.72,.15,pants);
  const pack=box(root,0,1.36,-.28,.38,.53,.2,enemy?black:redCloth);
  if(!enemy){box(root,-.22,1.34,.205,.08,.54,.04,cyan);box(root,.2,1.35,.205,.07,.35,.04,pink);}
  root.userData={torso,head,leftArm,rightArm,leftLeg,rightLeg,pack,visor,baseY:0};return root;
}
const playerRoot=new THREE.Group();world.add(playerRoot);const avatar=humanoid(playerRoot);avatar.scale.setScalar(1.02);
function addProp(x,z,type,label,amount=1){
  const root=new THREE.Group();root.position.set(x,0,z);world.add(root);
  let color=cyan;
  if(type==='food'||type==='water'||type==='med')color=type==='food'?amber:type==='water'?mat(0x44bafa,.3,.2,0x166bbd,1):pink;
  if(type==='scrap'||type==='parts')color=metal;
  if(type==='battery')color=mat(0x63d9ff,.25,.5,0x1b85cc,1.3);
  if(type==='tech')color=mat(0x9c6dff,.25,.55,0x6139cf,1.6);
  if(type==='terminal')color=pink;
  if(type==='document')color=amber;
  if(type==='relay')color=cyan;
  if(type==='shelter')color=cyan;
  if(type==='scrap'){box(root,0,.42,0,.75,.75,.65,mat(0x606a6d,.45,.65));box(root,.45,.24,.15,.25,.48,.28,black);}
  else if(type==='parts'){box(root,0,.36,0,.62,.55,.5,black);for(let i=-1;i<2;i++)box(root,i*.2,.68,0,.08,.24,.38,metal);}
  else if(type==='food'){box(root,0,.28,0,.55,.55,.42,amber);box(root,0,.57,0,.5,.08,.4,white);}
  else if(type==='water'){cylinder(root,0,.38,0,.22,.22,.7,color,8);cylinder(root,0,.78,0,.14,.15,.1,white,8);}
  else if(type==='med'){box(root,0,.35,0,.54,.5,.37,white);box(root,0,.36,.2,.11,.33,.02,pink);box(root,0,.36,.22,.32,.1,.02,pink);}
  else if(type==='terminal'){box(root,0,.85,0,.8,1.7,.35,black);box(root,0,1.02,.2,.65,.55,.06,pink);box(root,0,1.03,.24,.45,.06,.02,white);}
  else if(type==='relay'){box(root,0,.85,0,.9,1.7,.48,black);box(root,0,1.1,.26,.68,.72,.05,cyan);cylinder(root,0,2.1,-.12,.06,.06,.9,metal);sphere(root,0,2.58,-.12,.16,pink);}
  else if(type==='document'){box(root,0,.15,0,.72,.1,.5,black);box(root,0,.22,.02,.57,.035,.39,amber);}
  else if(type==='shelter'){box(root,0,1.5,0,3,3,2.4,darkConcrete);box(root,0,.8,1.23,1.2,1.6,.1,black);box(root,-1.2,2.2,1.25,.48,.1,.08,pink);box(root,1.2,2.2,1.25,.48,.1,.08,cyan);}
  else if(type==='cache'){box(root,0,.46,0,.9,.82,.7,mat(0x35444a,.4,.55));box(root,0,.9,.36,.75,.12,.04,color);}
  else if(type==='battery'){box(root,0,.4,0,.44,.74,.38,black);box(root,0,.4,.21,.23,.48,.04,color);}
  else if(type==='tech'){cylinder(root,0,.34,0,.34,.34,.45,black,6);cylinder(root,0,.34,0,.22,.22,.47,color,6);}
  if(!['terminal','shelter'].includes(type)){const glow=sphere(root,0,1,0,.12,color,8);root.userData.glow=glow;}
  if(type!=='terminal'&&type!=='shelter')root.position.y=0;
  const obj={root,type,label,amount,active:true,x,z};interactables.push(obj);if(['scrap','parts','food','water','med','document','cache','battery','tech'].includes(type))pickups.push(obj);return obj;
}
makeTerrain();
const shelter=addProp(-11,24,'shelter','Your burned shelter');
const rebirth=addProp(-7.5,26,'document','PROJECT REBIRTH // FRAGMENT');
const terminal=addProp(48,-27,'terminal','NEXUS DATA TERMINAL');
const safehouse=addProp(34,30,'cache','Resistance dead drop');
const relay=addProp(34,44,'relay','OLD LINE BROADCAST RELAY');
// Hand-placed supplies reward exploration; markets, wreckage, alleys and factory bins.
const supplyData=[[-26,25,'food',2],[-39,33,'water',2],[-47,25,'scrap',3],[-25,39,'parts',2],[-57,14,'med',1],[-33,53,'cache',1],[-56,-34,'scrap',4],[-41,-49,'parts',3],[-58,-55,'water',2],[-30,-39,'med',1],[-48,-25,'battery',2],[-28,-55,'scrap',3],[33,-26,'parts',2],[65,-26,'battery',2],[67,-49,'med',1],[31,-62,'food',2],[75,-51,'tech',1],[51,-18,'scrap',2],[38,54,'water',3],[56,38,'parts',2],[20,45,'food',2],[47,50,'cache',1],[28,69,'tech',1],[54,67,'med',1],[-10,-16,'scrap',2],[15,15,'battery',1],[1,40,'water',1]];
for(const [x,z,t,n] of supplyData)addProp(x,z,t,t==='battery'?'Battery cell':t==='tech'?'Nexus tech':({food:'Ration pack',water:'Purified water',scrap:'Scrap metal',parts:'Electronic components',med:'Medical supplies',cache:'Supply cache'})[t],n);
function collisionAt(x,z,r=.43){for(const b of blockers){const nx=Math.max(b.x,Math.min(x,b.x+b.w)),nz=Math.max(b.z,Math.min(z,b.z+b.d));if((x-nx)**2+(z-nz)**2<r*r)return true;}return false;}
function movePlayer(dx,dz){const nx=player.pos.x+dx,nz=player.pos.z+dz;if(!collisionAt(nx,player.pos.z))player.pos.x=nx;if(!collisionAt(player.pos.x,nz))player.pos.z=nz;}
function updateCamera(dt){const target=new THREE.Vector3(player.pos.x,player.pos.y+1.5,player.pos.z);const distance=aiming?4.1:6.7;const desired=new THREE.Vector3(target.x-Math.sin(cameraYaw)*distance*Math.cos(cameraPitch),target.y+Math.sin(cameraPitch)*distance+1.1,target.z-Math.cos(cameraYaw)*distance*Math.cos(cameraPitch));const lerp=1-Math.exp(-7*dt);camera.position.lerp(desired,lerp);camera.lookAt(target.x+Math.sin(cameraYaw)*.35,target.y+(aiming?.05:.28),target.z+Math.cos(cameraYaw)*.35);}
function syncPlayer(dt){playerRoot.position.copy(player.pos);playerRoot.rotation.y=player.yaw;const speed=Math.hypot(player.vel.x,player.vel.z);const moveAmount=Math.min(1,speed/5.5);const swing=Math.sin(elapsed*(player.crouch?6:11))*moveAmount;
 avatar.userData.leftLeg.rotation.x=swing*.72;avatar.userData.rightLeg.rotation.x=-swing*.72;avatar.userData.leftArm.rotation.x=-swing*.5;avatar.userData.rightArm.rotation.x=swing*.5;
 avatar.position.y=player.pos.y;
 avatar.userData.torso.rotation.z=THREE.MathUtils.lerp(avatar.userData.torso.rotation.z,-player.vel.x*.025,.1);
 avatar.userData.leftArm.rotation.z=player.crouch?.17:0;avatar.userData.rightArm.rotation.z=player.crouch?-.17:0;
}
function findTarget(){const forward=new THREE.Vector3(Math.sin(cameraYaw),0,Math.cos(cameraYaw));let best=null,score=99;for(const e of enemies){if(!e.alive)continue;const dir=new THREE.Vector3(e.x-player.pos.x,0,e.z-player.pos.z);const d=dir.length();if(d>34||d<.2)continue;dir.normalize();const dot=dir.dot(forward);if(dot<.86)continue;const s=d+(1-dot)*22;if(s<score){score=s;best=e;}}return best;}
function fire(){if(paused||player.dead||!gameStarted)return;if(player.ammo<=0){showToast('MAGAZINE EMPTY · PRESS R');return;}const target=findTarget();player.ammo--;player.stamina=Math.max(0,player.stamina-1.6);if(target){const distance=Math.hypot(target.x-player.pos.x,target.z-player.pos.z);target.hp-=player.weapon==='PULSE SIDEARM'?36:25;target.root.rotation.y=Math.atan2(player.pos.x-target.x,player.pos.z-target.z);if(target.hp<=0){target.alive=false;target.root.visible=false;player.kills++;inventory.scrap+=2;if(Math.random()<.6)inventory.components++;showToast('THREAT NEUTRALIZED · SALVAGE +2');if(player.kills===2&&player.mission<2)showToast('THE PATROL SIGNAL IS QUIET');}else showToast(distance>20?'HIT · LONG RANGE':'HIT CONFIRMED');}else showToast('SHOT FIRED · TARGET OUT OF SIGHT');updateUI();}
function reload(){if(player.ammo>=12||player.reserve<=0){showToast(player.reserve<=0?'NO AMMUNITION':'MAGAZINE FULL');return;}const n=Math.min(12-player.ammo,player.reserve);player.ammo+=n;player.reserve-=n;inventory.ammo=player.reserve;showToast('RELOADED · '+player.ammo+' / '+player.reserve);updateUI();}
function useItem(slot){if(slot==='1'){if(inventory.food>0){inventory.food--;player.hunger=Math.min(100,player.hunger+38);showToast('RATION CONSUMED · NOURISHMENT +38');}else showToast('NO FOOD IN FIELD KIT');}
 if(slot==='2'){if(inventory.water>0){inventory.water--;player.thirst=Math.min(100,player.thirst+42);showToast('WATER CONSUMED · HYDRATION +42');}else showToast('NO WATER IN FIELD KIT');}
 if(slot==='3'){if(inventory.med>0){inventory.med--;player.health=Math.min(100,player.health+32);showToast('MED SUPPLY USED · HEALTH +32');}else if(inventory.kits>0){inventory.kits--;player.health=Math.min(100,player.health+55);showToast('FIELD KIT USED · HEALTH +55');}else showToast('NO MEDICAL SUPPLIES');}
 if(slot==='4'){if(inventory.kits>0){inventory.kits--;player.health=Math.min(100,player.health+45);showToast('FIELD MEDKIT USED · HEALTH +45');}else openCraft();}updateUI();}
function updateUI(){for(const [id,value] of [['health',player.health],['stamina',player.stamina],['thirst',player.thirst],['hunger',player.hunger]]){document.querySelector(`#${id}-bar`).style.width=Math.max(0,value)+'%';document.querySelector(`#${id}-value`).textContent=Math.round(value)+(id==='health'||id==='stamina'?'':'%');}document.querySelector('#armor-value').textContent=player.armor;document.querySelector('#ammo-count').innerHTML=`${player.ammo} <i>/</i> ${player.reserve}`;document.querySelector('#weapon-name').textContent=player.weapon;document.querySelector('#condition').textContent=player.health<30?'CRITICAL':player.thirst<22||player.hunger<22?'DEHYDRATED':'STABLE';document.querySelector('#condition').style.color=player.health<30?'#fb416e':'#16d9cc';document.querySelector('#quick-items').innerHTML=[['1','▰',inventory.food],['2','◉',inventory.water],['3','✚',inventory.med+inventory.kits],['4','⚙',inventory.kits]].map(([k,icon,n])=>`<div class="quick-slot"><small style="position:absolute;top:2px;left:4px;font-size:7px;color:#91a0a5">${k}</small>${icon}<b>${n}</b></div>`).join('');}
function updateWorld(dt){
 // Survival drains gradually. Hunger/thirst below 15% cause damage; shelters slowly recover energy.
 player.hunger=Math.max(0,player.hunger-dt*.032);player.thirst=Math.max(0,player.thirst-dt*.048);
 if(player.hunger<15||player.thirst<15)player.health=Math.max(0,player.health-dt*(player.hunger<15&&player.thirst<15?1.5:.65));
 const nearShelter=Math.hypot(player.pos.x+11,player.pos.z-24)<7;if(nearShelter){player.stamina=Math.min(100,player.stamina+dt*22);player.health=Math.min(100,player.health+dt*1.1);player.hunger=Math.max(0,player.hunger-dt*.01);}
 for(const h of decor){if(h.type==='toxic'&&Math.hypot(player.pos.x-h.x,player.pos.z-h.z)<h.r){player.health=Math.max(0,player.health-dt*5);player.stamina=Math.max(0,player.stamina-dt*10);}}
 for(const e of enemies){if(!e.alive)continue;e.phase+=dt;const d=Math.hypot(player.pos.x-e.x,player.pos.z-e.z);const aggro=d<19;if(aggro){const dx=(player.pos.x-e.x)/Math.max(d,.01),dz=(player.pos.z-e.z)/Math.max(d,.01);if(d>4){e.x+=dx*dt*(e.type==='drone'?1.5:.9);e.z+=dz*dt*(e.type==='drone'?1.5:.9);e.root.position.set(e.x,e.type==='drone'?1+Math.sin(e.phase*2)*.24:0,e.z);if(e.type==='guard')e.root.rotation.y=Math.atan2(dx,dz);}else if(e.attack<=0){e.attack=1.35;const raw=e.type==='drone'?8:12;const damage=Math.max(2,raw-player.armor*.12);player.health=Math.max(0,player.health-damage);player.armor=Math.max(0,player.armor-2);showToast(e.type==='drone'?'SENTRY DRONE · UNDER FIRE':'NEXUS GUARD · UNDER FIRE');}
 }else if(e.type==='drone'){e.root.position.y=1+Math.sin(e.phase*1.3)*.3;e.root.position.x=e.x+Math.sin(e.phase*.35)*2.1;e.root.position.z=e.z+Math.cos(e.phase*.35)*2.1;}else{e.x+=Math.sin(e.phase*.4)*dt*.25;e.z+=Math.cos(e.phase*.4)*dt*.25;e.root.rotation.y=Math.sin(e.phase*.4);e.root.position.set(e.x,0,e.z);}e.attack-=dt;
 }
 if(player.health<=0&&!player.dead){player.dead=true;paused=true;const el=document.createElement('div');el.className='death-screen';el.innerHTML='<div><div style="font-size:10px;letter-spacing:3px;color:#93a1a5">NEXUS CONTROL NETWORK // SIGNAL LOST</div><h1>END OF THE LINE</h1><p>District Zero remembers. The resistance is not finished.<br>Try again from the last safehouse.</p><button class="primary-button" id="respawn">RETURN TO SAFEHOUSE&nbsp; →</button></div>';document.querySelector('#game-shell').appendChild(el);document.querySelector('#respawn').onclick=()=>{el.remove();player.health=100;player.stamina=100;player.hunger=65;player.thirst=75;player.dead=false;player.pos.set(-11,0,24);paused=false;};}
}
function updateInteraction(){interactTarget=findNearest();const prompt=document.querySelector('#interaction-prompt');if(interactTarget){prompt.style.display='flex';prompt.querySelector('span').textContent=interactTarget.label.toUpperCase();}else prompt.style.display='none';}
function updateMarker(){const target=player.mission===0?shelter:player.mission===1?safehouse:player.mission===2?terminal:relay;const el=document.querySelector('#world-marker');if(player.mission>=4||!target||!target.active){el.style.display='none';return;}const p=new THREE.Vector3(target.x,3,target.z).project(camera);if(p.z<1&&Math.abs(p.x)<.95&&Math.abs(p.y)<.9){el.style.display='block';el.style.left=((p.x+1)/2*innerWidth)+'px';el.style.top=((1-p.y)/2*innerHeight)+'px';}else el.style.display='none';const d=Math.round(Math.hypot(target.x-player.pos.x,target.z-player.pos.z));document.querySelector('#objective-distance').textContent=d+'m';}
function updateRegion(){let region='DISTRICT ZERO',sub='LOWER CITY',fog=0x090d16;if(player.pos.x<-20&&player.pos.z<-14){region='INDUSTRIAL SECTOR';sub='FOUNDRY 09';fog=0x15120f;}else if(player.pos.x>22&&player.pos.z<-15){region='NEXUS DISTRICT';sub='CORPORATE ZONE';fog=0x0b111c;}else if(player.pos.x>20&&player.pos.z>18){region='UNDERGROUND NETWORK';sub='EAST STATION';fog=0x081614;}document.querySelector('#region-name').textContent=region;document.querySelector('.region-chip small').textContent=sub;scene.fog.color.setHex(fog);scene.background.setHex(fog);}
function animate(){requestAnimationFrame(animate);const dt=Math.min(.05,clock.getDelta());elapsed+=dt;
 if(gameStarted&&!paused){const forward=(keys.KeyW?1:0)-(keys.KeyS?1:0)+(touchMove.y||0),side=(keys.KeyD?1:0)-(keys.KeyA?1:0)+(touchMove.x||0);const length=Math.hypot(forward,side)||1;const sprint=(keys.ShiftLeft||keys.ShiftRight||touchSprinting)&&player.stamina>2&&!player.crouch;const speed=(player.crouch?1.8:sprint?8.2:4.7)*(player.hunger<15||player.thirst<15?.78:1);const ax=(Math.sin(cameraYaw)*forward+Math.cos(cameraYaw)*side)/length,az=(Math.cos(cameraYaw)*forward-Math.sin(cameraYaw)*side)/length;const desiredX=ax*speed,desiredZ=az*speed;const smoothing=1-Math.exp(-11*dt);player.vel.x=THREE.MathUtils.lerp(player.vel.x,desiredX,smoothing);player.vel.z=THREE.MathUtils.lerp(player.vel.z,desiredZ,smoothing);movePlayer(player.vel.x*dt,player.vel.z*dt);if(Math.hypot(ax,az)>.12){player.yaw=THREE.MathUtils.lerp(player.yaw,Math.atan2(ax,az),1-Math.exp(-12*dt));}
   if(sprint&&Math.hypot(ax,az)>.1)player.stamina=Math.max(0,player.stamina-dt*16);else player.stamina=Math.min(100,player.stamina+dt*(player.crouch?10:17));player.pos.y=Math.max(0,player.pos.y);if(player.jumpVelocity!==undefined){player.jumpVelocity-=20*dt;player.pos.y=Math.max(0,player.pos.y+player.jumpVelocity*dt);if(player.pos.y===0)player.jumpVelocity=undefined;}
   if(firing){fire();firing=false;}updateWorld(dt);updateInteraction();updateRegion();updateMarker();syncPlayer(dt);updateUI();
 }
 updateCamera(dt);renderer.render(scene,camera);
}
const touchMove={x:0,y:0};let touchSprinting=false;animate();
const joy=document.querySelector('.joy-zone'),knob=document.querySelector('.joy-knob');let joyPointer=null;joy.addEventListener('pointerdown',e=>{joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);});joy.addEventListener('pointermove',e=>{if(joyPointer!==e.pointerId)return;const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy),scale=Math.min(1,len/46);touchMove.x=dx/Math.max(len,1)*scale;touchMove.y=-dy/Math.max(len,1)*scale;knob.style.transform=`translate(${touchMove.x*34}px,${-touchMove.y*34}px)`;});function releaseJoy(){joyPointer=null;touchMove.x=touchMove.y=0;knob.style.transform='';}joy.addEventListener('pointerup',releaseJoy);joy.addEventListener('pointercancel',releaseJoy);
document.querySelectorAll('.touch-actions button').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();const a=button.dataset.action;if(a==='interact')interact();if(a==='jump'&&player.pos.y===0)player.jumpVelocity=7.6;if(a==='sprint')touchSprinting=true;if(a==='fire')fire();});button.addEventListener('pointerup',()=>{if(button.dataset.action==='sprint')touchSprinting=false;});button.addEventListener('pointercancel',()=>touchSprinting=false);});
window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Escape'){if(document.querySelector('#overlay').classList.contains('active'))closeModal();else if(gameStarted){if(!paused)openPause();else closePause();}}if(e.code==='KeyE')interact();if(e.code==='KeyI')openInventory();if(e.code==='KeyB')openCraft();if(e.code==='KeyM')openMap();if(e.code==='KeyR')reload();if(e.code==='KeyC')player.crouch=!player.crouch;if(e.code==='Space'&&player.pos.y===0&&gameStarted&&!paused){player.jumpVelocity=7.6;}if(/^Digit[1-4]$/.test(e.code))useItem(e.code.slice(-1));if(e.code==='KeyF')fire();});window.addEventListener('keyup',e=>keys[e.code]=false);
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('mousedown',e=>{if(!gameStarted){return;}if(e.button===0){fire();}if(e.button===2)aiming=true;if(e.button===0&&document.pointerLockElement!==canvas&&!paused)canvas.requestPointerLock?.();});window.addEventListener('mouseup',e=>{if(e.button===2)aiming=false;});window.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&!paused){cameraYaw-=e.movementX*sensitivity;cameraPitch=THREE.MathUtils.clamp(cameraPitch+e.movementY*sensitivity*(invertCamera?-1:1),-.25,.68);}});
canvas.addEventListener('touchstart',()=>{}, {passive:true});window.addEventListener('wheel',e=>{if(document.pointerLockElement===canvas&&!paused)cameraPitch=THREE.MathUtils.clamp(cameraPitch+e.deltaY*.0003,-.25,.68);},{passive:true});
function openPause(){paused=true;showModal('PAUSED','NEON REBELLION // 2189',`<div class="tab-row"><button class="tab active" id="resume">RESUME</button><button class="tab" id="settings">SETTINGS</button><button class="tab" id="pause-map">CITY MAP</button></div><p class="story-copy">The streets don't stop moving when you do.<br><br><strong>WASD</strong> move · <strong>SHIFT</strong> sprint · <strong>SPACE</strong> jump · <strong>C</strong> crouch<br><strong>E</strong> interact · <strong>LMB</strong> fire · <strong>R</strong> reload<br><strong>I</strong> field kit · <strong>B</strong> fabricate · <strong>M</strong> map · <strong>ESC</strong> resume</p>`);document.querySelector('#resume').onclick=closeModal;document.querySelector('#settings').onclick=openSettings;document.querySelector('#pause-map').onclick=openMap;}
function closePause(){paused=false;}
document.querySelector('#start-button').addEventListener('click',()=>{gameStarted=true;paused=false;document.querySelector('#intro').classList.add('hidden');updateUI();showToast('SIGNAL TRACE ACQUIRED · CHECK THE SHELTER');});document.querySelector('#map-button').addEventListener('click',openMap);document.querySelector('#pause-button').addEventListener('click',()=>gameStarted&&openPause());window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));});
setInterval(()=>{const mins=Math.floor(elapsed/60),s=48+mins;document.querySelector('#clock').textContent=`${String(23+Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;},1000);
// Resistance operatives: one offers intel, the other marks a safe cache.
function makeNPC(x,z,name,color,dialog){const root=new THREE.Group();root.position.set(x,0,z);world.add(root);const model=humanoid(root);model.traverse(o=>{if(o.isMesh&&o.material===jacket)o.material=color});const npc={root,type:'npc',label:name,dialog,active:true,x,z};interactables.push(npc);return npc;}
const ally=makeNPC(-29,32,'MARA // STREET MEDIC',mat(0x284944,.8),'You found the signal. NEXUS hit this block for a reason. The relay shard in the ash has the Rebirth protocol. Take it to the old drop under the east stairs. I can patch you up, if you bring components.');
const scout=makeNPC(36,33,'JAX // RUNNER',mat(0x524033,.8),'The tunnels breathe toxic air, but the old line runs beneath the Nexus. Find me a power cell and I can open the relay. The drop is yours—just keep the patrols off my back.');
function spawnEnemy(x,z,type='drone'){
 const root=new THREE.Group();root.position.set(x,0,z);world.add(root);
 const bot=new THREE.Group();root.add(bot);
 if(type==='drone'){sphere(bot,0,1.5,0,.55,mat(0x303b43,.35,.75));box(bot,0,1.48,.5,.65,.12,.16,pink);for(let i=0;i<4;i++){const a=i*Math.PI/2;box(bot,Math.cos(a)*.78,1.48,Math.sin(a)*.78,.6,.1,.1,metal).rotation.y=-a;}
   for(let i=0;i<2;i++)sphere(bot,(i-.5)*.24,1.52,.47,.09,amber,8);
 }else{const human=humanoid(bot,true);human.scale.setScalar(.85);}
 const e={root,bot,type,hp:type==='drone'?45:65,x,z,attack:0,phase:Math.random()*6,alive:true};enemies.push(e);return e;
}
spawnEnemy(-54,38,'drone');spawnEnemy(-39,-58,'guard');spawnEnemy(-29,-32,'drone');spawnEnemy(72,-43,'guard');spawnEnemy(39,-62,'drone');spawnEnemy(63,57,'guard');

const inventory={scrap:5,components:3,batteries:1,mechanical:1,tech:0,med:1,food:1,water:1,ammo:36,armor:0,kits:0};
const itemInfo={scrap:['Scrap metal','◈'],components:['Electronics','⌘'],batteries:['Battery cells','▣'],mechanical:['Mechanical parts','⚙'],tech:['Nexus tech','◇'],med:['Medical supplies','✚'],food:['Ration packs','▰'],water:['Purified water','◉'],ammo:['Ammo reserve','⊙'],armor:['Armor plating','⬡'],kits:['Med kits','✚']};
function showToast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2300);}
function showModal(title,kicker,content,close=true){const overlay=document.querySelector('#overlay'),panel=document.querySelector('#modal-content');panel.innerHTML=`<div class="modal-head"><div><div class="modal-kicker">${kicker}</div><div class="modal-title">${title}</div></div>${close?'<button class="close-modal">ESC ×</button>':''}</div>${content}`;overlay.classList.add('active');paused=true;panel.querySelector('.close-modal')?.addEventListener('click',closeModal);}
function closeModal(){document.querySelector('#overlay').classList.remove('active');if(gameStarted&&!player.dead)paused=false;}
function openCraft(){
 const recipes=[
  {id:'pistol',name:'PULSE SIDEARM',desc:'Build a low-recoil backup weapon. More punch, less noise.',cost:{scrap:8,components:5,batteries:1},action:()=>{player.weapon='PULSE SIDEARM';player.ammo=18;player.reserve+=24;showToast('PULSE SIDEARM ASSEMBLED');}},
  {id:'ammo',name:'PISTOL AMMO ×12',desc:'A dozen 9mm caseless rounds for your scrap pistol.',cost:{scrap:2,components:1},action:()=>{player.reserve+=12;inventory.ammo+=12;showToast('12 ROUNDS CRAFTED');}},
  {id:'medkit',name:'FIELD MEDKIT',desc:'Restore 45 health. Use immediately from your field kit.',cost:{med:1,components:2},action:()=>{inventory.kits++;showToast('FIELD MEDKIT CRAFTED · Press 4 to use');}},
  {id:'armor',name:'PATCHWORK ARMOR',desc:'Improvised plates absorb incoming damage.',cost:{scrap:6,mechanical:2},action:()=>{player.armor=Math.min(60,player.armor+25);inventory.armor=player.armor;showToast('ARMOR PLATED · +25 protection');}},
 ];
 const rows=recipes.map(r=>`<div class="craft-item"><div><div class="craft-name">${r.name}</div><div class="craft-desc">${r.desc}</div><div class="craft-cost">${Object.entries(r.cost).map(([k,v])=>`${v} ${itemInfo[k][0]}`).join(' · ')}</div></div><button class="craft-button" data-recipe="${r.id}" ${Object.entries(r.cost).some(([k,v])=>inventory[k]<v)?'disabled':''}>CRAFT</button></div>`).join('');
 showModal('FIELD FABRICATOR','WORKBENCH // IMPROVISE TO SURVIVE',`<div class="craft-grid">${rows}</div><div class="story-copy" style="margin-top:16px;font-size:9px">Components are scarce. Salvage electronic wreckage and search the industrial sector.</div>`);
 document.querySelectorAll('.craft-button').forEach(button=>button.addEventListener('click',()=>{const r=recipes.find(a=>a.id===button.dataset.recipe);if(Object.entries(r.cost).some(([k,v])=>inventory[k]<v))return;Object.entries(r.cost).forEach(([k,v])=>inventory[k]-=v);r.action();openCraft();updateUI();}));
}
function openInventory(){const content=Object.entries(inventory).map(([k,v])=>`<div class="inv-item"><b>${itemInfo[k][1]} &nbsp;${v}</b>${itemInfo[k][0]}</div>`).join('');showModal('FIELD KIT','PERSONAL INVENTORY // I',`<div class="inventory-grid">${content}</div><div style="margin-top:18px"><button class="craft-button" id="craft-from-inv">OPEN FABRICATOR</button></div>`);document.querySelector('#craft-from-inv').onclick=openCraft;}
function openMap(){showModal('THE LOWER CITY','TACTICAL MAP // M',`<div class="map-grid"><div class="district-card active"><b>01 · DISTRICT ZERO</b><span>Street markets · Shelter ruins · Resistance dead drops<br>Current position: ${Math.round(player.pos.x)}, ${Math.round(player.pos.z)}</span></div><div class="district-card"><b>02 · INDUSTRIAL SECTOR</b><span>Foundry 09 · Toxic runoff · Salvage caches<br>Scavenging: scrap / machine parts</span></div><div class="district-card"><b>03 · NEXUS DISTRICT</b><span>Arcology 01 · Security patrols · Project Rebirth terminal<br>Threat level: HIGH</span></div><div class="district-card"><b>04 · UNDERGROUND NETWORK</b><span>Old subway · Relay line · Hidden resistance route<br>Access: east station stairs</span></div></div><div class="story-copy" style="margin-top:18px">Safehouse: <strong>East stair dead drop</strong> · Last known signal source: <strong>burned shelter</strong></div>`);}
function openSettings(){showModal('SYSTEM SETTINGS','ACCESSIBILITY // DISPLAY',`<div class="settings-row"><span>CAMERA SENSITIVITY</span><input id="sensitivity" type="range" min=".0008" max=".006" step=".0001" value=".0022"></div><div class="settings-row"><span>CAMERA INVERT</span><input id="invert" type="checkbox"></div><div class="settings-row"><span>QUALITY</span><select id="quality"><option>Balanced</option><option>Performance</option></select></div><p class="story-copy">WASD move · Shift sprint · Space jump · C crouch · E interact · Left mouse fire · R reload · I inventory · B craft · M map · Esc pause</p>`);document.querySelector('#sensitivity').oninput=e=>sensitivity=+e.target.value;document.querySelector('#invert').onchange=e=>invertCamera=e.target.checked;document.querySelector('#quality').onchange=e=>{renderer.setPixelRatio(Math.min(devicePixelRatio,e.target.value==='Performance'?1:1.7));};}
let sensitivity=.0022,invertCamera=false;
function updateMission(){const names=[['ASHES OF HOME','Find the source of the signal in the ruins.','Investigate the burned shelter'],['A DEAD DROP','Mara decoded the fragment. Find Jax at the east stairwell.','Reach the resistance dead drop'],['THE SIGNAL UNDERGROUND','The relay shard can expose the Rebirth program. Search the Nexus terminal.','Recover Project Rebirth data'],['REBIRTH PROTOCOL','The city-wide control protocol is exposed. Transmit the evidence from the old line.','Broadcast the proof from the underground relay'],['A CITY AWAKENS','The truth is out. The resistance is moving across every district.','Story complete · keep surviving']];const a=names[Math.min(player.mission,4)];document.querySelector('#mission-title').textContent=a[0];document.querySelector('#mission-copy').textContent=a[1];document.querySelector('#objective-text').textContent=a[2];}
function findNearest(){let nearest=null,dist=2.8;for(const o of interactables){if(!o.active)continue;const d=Math.hypot(player.pos.x-o.x,player.pos.z-o.z);if(d<dist){dist=d;nearest=o;}}return nearest;}
function interact(){const o=findNearest();if(!o){showToast('NOTHING IN REACH');return;}if(o.type==='npc'){
   if(o===ally){showModal('MARA VEX','DISTRICT ZERO // STREET MEDIC',`<div class="story-copy">${o.dialog}<br><br><strong>“They burned our homes looking for a file. They found you instead.”</strong></div><div style="margin-top:18px"><button class="craft-button" id="medic-treat">TRADE 1 MED SUPPLY · RESTORE 35 HP</button></div>`);document.querySelector('#medic-treat').onclick=()=>{if(inventory.med>0&&player.health<100){inventory.med--;player.health=Math.min(100,player.health+35);showToast('MARA PATCHED YOU UP');updateUI();}else showToast(inventory.med?'HEALTH ALREADY FULL':'NO MEDICAL SUPPLIES');};return;}
   showModal('JAX RHEE','RESISTANCE RUNNER // EAST STATION',`<div class="story-copy">${o.dialog}<br><br><strong>“The station's ours if we can keep it alive.”</strong></div>`);return;
 }
 if(o.type==='shelter'){if(player.mission===0){showModal('THE SHELTER','DISTRICT ZERO // 23:48',`<div class="story-copy">The blackened shelter is still warm. Your bed, your papers, every last memory—gone. A scorched data wafer blinks beneath a collapsed support beam.<br><br><strong>A NEXUS insignia is stamped into the melted floor.</strong><br><br>The breach team knew exactly what they were searching for.</div><div style="margin-top:18px;color:#ff4778;font-size:9px">SEARCH THE GLOWING DATA WAFER NEAR THE RUINS</div>`);return;}showToast('ASHES STILL SMOLDER. KEEP MOVING.');return;}
 if(o.type==='document'){
   inventory.tech++;player.hasRebirth=true;o.active=false;o.root.visible=false;player.mission=1;updateMission();showModal('PROJECT REBIRTH','CLASSIFIED // NEXUS CORPORATION',`<div class="document-text"><h3>SUBJECT CONTROL INITIATIVE / REBIRTH</h3>Phase 4 deployment authorized. Water rationing and neural-frequency broadcast will establish permanent population compliance. Lower-city shelter raids are to be classified as “infrastructure stabilization.”<br><br><b>RELAY KEY:</b> EAST SUBWAY / PLATFORM 03<br><b>TRANSFER ROUTE:</b> NEXUS ARC 01<br><br>The protocol isn't a weapon. It's a city-wide switch. If this gets out, the entire lower city will rise.</div><p class="story-copy">A shredded voice file crackles to life: “If you can hear this, find Mara at the market. The relay shard's in the station drop.”</p>`);showToast('PROJECT REBIRTH DATA RECOVERED');return;
 }
 if(o.type==='cache'){
   inventory.scrap+=4;inventory.components+=2;inventory.food+=1;inventory.water+=1;o.active=false;o.root.visible=false;showToast(o===safehouse?'DEAD DROP LOOTED · +4 SCRAP · +2 COMPONENTS':'SUPPLY CACHE LOOTED · +4 SCRAP · +2 COMPONENTS');
   if(o===safehouse&&player.mission===1){player.mission=2;updateMission();showToast('MISSION UPDATED · LOCATE THE NEXUS TERMINAL');}return;
 }
 if(o.type==='terminal'){if(player.mission<2){showToast('NEXUS ENCRYPTION · COMPLETE THE DEAD DROP FIRST');return;}
   if(player.mission===2){player.mission=3;inventory.tech+=3;inventory.components+=4;updateMission();showModal('THE REBIRTH FILES','NEXUS ARC 01 // ENCRYPTION BROKEN',`<div class="document-text"><h3>PROJECT REBIRTH — LIVE DEPLOYMENT</h3>Three million residents are already inside the compliance field. The initial broadcast begins at 06:00. Target districts: <b>ZERO / FOUNDRY / EAST LINE.</b><br><br>One person cannot stop the network. But one leak can start a rebellion.<br><br><b>UPLOAD COMPLETE.</b> ROUTE DECRYPTED. BROADCAST THE PROOF.</div><p class="story-copy">The terminal unlocks NEXUS technical caches across the city. Get this evidence to the resistance before dawn.</p>`);return;}showToast('DATA MIRRORED TO THE RESISTANCE');return;
 }
 if(o.type==='relay'){
    if(player.mission<3){showToast('RELAY LOCKED · RECOVER THE REBIRTH FILES FIRST');return;}
    if(player.mission===3){player.mission=4;updateMission();showModal('THE CITY HEARS YOU','RESISTANCE BROADCAST // 05:57',`<div class="document-text"><h3>TRANSMISSION COMPLETE</h3>The Rebirth files race across the old line. Every district receives the truth before the compliance broadcast can begin.<br><br>Markets open their shutters. Factory lights go dark. Across the city, people answer the signal:<br><br><b>“WE ARE STILL HERE.”</b></div><p class="story-copy">The rebellion has begun. District Zero is no longer alone.</p>`);return;}showToast('THE CITY IS LISTENING');return;
  }
  if(['food','water','med','scrap','parts','battery','tech'].includes(o.type)){const key={food:'food',water:'water',med:'med',scrap:'scrap',parts:'components',battery:'batteries',tech:'tech'}[o.type];inventory[key]+=o.amount;o.active=false;o.root.visible=false;showToast(`SALVAGED ${o.amount} × ${itemInfo[key][0].toUpperCase()}`);return;}
}
