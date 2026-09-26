import {robots,systems,components} from './data.js';
import {salesGuides} from './sales-guides.js';

const $=s=>document.querySelector(s);
const state={activeSection:'atlas',activeRobot:'human',activeHotspot:null,activeSystem:null,activeComponent:null,activeLearningTopic:null,activeSalesProduct:'force'};
const esc=v=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const activeRobot=()=>robots[state.activeRobot];
const robotAssets=new Map();
const componentAssets=new Map();
let robotTransitionTimer;
const idle=callback=>window.requestIdleCallback?window.requestIdleCallback(callback,{timeout:900}):window.setTimeout(callback,120);
function preloadComponentAsset(id){
  const component=components[id];if(!component?.image)return Promise.resolve();
  if(componentAssets.has(id))return componentAssets.get(id).ready;
  const image=new Image();image.decoding='async';image.src=component.image;
  const ready=image.decode?.().catch(()=>{})||Promise.resolve();
  componentAssets.set(id,{image,ready});return ready;
}
function prefetchComponentAssets(ids){ids.filter(Boolean).forEach(preloadComponentAsset)}
function preloadRobotAssets(){
  Object.values(robots).forEach(robot=>{
    const image=new Image();
    image.decoding='async';
    image.src=`./assets/${robot.image}`;
    robotAssets.set(robot.id,{image,hotspots:robot.hotspots,components:robot.components,metadata:robot});
    image.decode?.().catch(()=>{});
    // Hotspots, systems and component metadata are retained in memory with the image.
    robot.hotspots.forEach(point=>systems[point.system]);robot.components.forEach(id=>components[id]);
  });
  // Keep the first exploration path warm without decoding every product image on entry.
  prefetchComponentAssets(['joint','motor','reducer','encoder','servo','force','vision3d','hand']);
}

function setSection(section){
  state.activeSection=section;
  const atlas=section==='atlas';
  $('.exploration-space').hidden=!atlas;
  $('#explorer').hidden=true;
  $('#component-detail').hidden=true;
  $('#learning-mode').hidden=section!=='learn';
  $('#sales-mode').hidden=section!=='sales';
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===section));
  if(section==='learn')renderLearning();
  if(section==='sales'){if(state.activeComponent&&saleProducts.includes(state.activeComponent))state.activeSalesProduct=state.activeComponent;renderSales();}
}

function renderSelector(){
  $('#robot-selector').innerHTML=Object.values(robots).map(robot=>`<button class="robot-tab ${robot.id===state.activeRobot?'selected':''}" data-robot="${robot.id}" aria-pressed="${robot.id===state.activeRobot}"><span class="robot-tab-index">${robot.index}</span><span>${robot.name}</span><small>${robot.englishName}</small></button>`).join('');
}
function syncSelector(){document.querySelectorAll('[data-robot]').forEach(button=>{const selected=button.dataset.robot===state.activeRobot;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))})}
function updateRobotStage(robot){
  const cached=robotAssets.get(robot.id);
  const stage=$('#robot-stage');
  Object.keys(robots).forEach(id=>stage.classList.remove(id));
  stage.classList.add(robot.id);
  const image=$('#hero-robot');
  image.src=cached?.image.currentSrc||cached?.image.src||`./assets/${robot.image}`;
  image.alt=`${robot.name}产品视觉`;
  $('#robot-caption').textContent=`${robot.index} / ${robot.category}`;
  $('#hotspots').innerHTML=(cached?.hotspots||robot.hotspots).map(point=>`<button class="hotspot ${state.activeHotspot===point.id?'selected':''}" data-hotspot="${point.id}" style="--x:${point.x}%;--y:${point.y}%" aria-label="探索${point.label}"><span class="hotspot-dot"></span><span class="hotspot-label"><span><strong>${point.label}</strong><small>${systems[point.system]?.discipline||'系统'}</small></span><span class="label-arrow" aria-hidden="true">↗</span></span></button>`).join('');
}
function renderAtlas(){
  const robot=activeRobot();
  const title=$('.intro h1');
  title.innerHTML=`${robot.name}<br><span>${robot.englishName}</span>`;
  $('.intro-copy').textContent=robot.description;
  updateRobotStage(robot);
  if($('#robot-selector').childElementCount)syncSelector();else renderSelector();
}
function changeRobot(id){
  if(!robots[id]||id===state.activeRobot)return;
  state.activeRobot=id;state.activeHotspot=null;state.activeSystem=null;state.activeComponent=null;
  idle(()=>prefetchComponentAssets(robots[id].components));
  const stage=$('#robot-stage');stage.classList.add('is-switching');
  $('#component-panel').hidden=true;
  syncSelector();
  window.clearTimeout(robotTransitionTimer);
  robotTransitionTimer=window.setTimeout(()=>{
    renderAtlas();
    const next=$('#robot-stage');next.classList.remove('is-switching');next.classList.add('is-entering');
    requestAnimationFrame(()=>requestAnimationFrame(()=>next.classList.remove('is-entering')));
  },120);
}
function closeWorkspacePanel(){state.activeHotspot=null;state.activeSystem=null;state.activeComponent=null;$('#component-panel').hidden=true;renderAtlas()}
function componentsForSystem(systemId){
  const robot=activeRobot();
  return (systems[systemId]?.components||[]).filter(id=>robot.components.includes(id));
}
function openSystem(point){
  state.activeHotspot=point.id;state.activeSystem=point.system;state.activeComponent=null;
  const system=systems[point.system];const ids=componentsForSystem(point.system);prefetchComponentAssets(ids);
  const panel=$('#component-panel');panel.hidden=false;
  panel.innerHTML=`<button class="panel-close" data-close-panel aria-label="关闭">×</button><p class="detail-eyebrow">${esc(system.discipline)}</p><h2>${esc(point.label)}</h2><p class="panel-summary">${esc(system.description)}</p><div class="panel-list">${ids.map(id=>`<button data-component="${id}"><span>${esc(components[id].name)}<small>${esc(components[id].englishName)}</small></span><i>→</i></button>`).join('')}</div><p class="panel-footnote">${esc(activeRobot().name)} / ${esc(point.label)} / 选择一个零部件</p>`;
  renderAtlas();
}
function componentDetailMarkup(component,{workspace=false}={}){
  const image=component.image?`<div class="component-image-skeleton" aria-hidden="true"></div><img data-component-image src="${component.image}" alt="${esc(component.name)} 产品视觉">`:'<div class="visual-pending">视觉素材待补充</div>';
  return `<button class="panel-close" data-close-component aria-label="关闭">×</button>${workspace?'<button class="panel-back" data-back-system>← 返回系统</button>':''}<p class="detail-eyebrow">${esc(component.category)}</p><h2>${esc(component.name)}</h2><p class="component-description">${esc(component.description)}</p><div class="component-visual is-loading">${image}<span>${esc(component.englishName)}</span></div><dl class="component-facts"><div><dt>作用</dt><dd>${esc(component.function)}</dd></div><div><dt>安装位置</dt><dd>${component.location.map(esc).join(' / ')}</dd></div><div><dt>核心组成</dt><dd>${component.core.map(esc).join(' / ')}</dd></div><div><dt>关键参数</dt><dd>${component.keySpecs.map(esc).join(' / ')}</dd></div><div><dt>适用机器人</dt><dd>${component.downstream.map(esc).join(' / ')}</dd></div></dl><div class="related-inline"><p>相关零部件</p>${component.relatedComponents.map(next=>`<button data-component="${next}">${esc(components[next]?.name||next)} ↗</button>`).join('')}</div><button class="flow-expand" data-flow="${component.id||''}" data-component-flow="${Object.entries(components).find(([,value])=>value===component)?.[0]||''}">查看产业链 →</button><div class="mini-flow" hidden></div>`;
}
function openComponent(id,target='#component-panel'){
  const component=components[id];if(!component)return;
  state.activeComponent=id;
  const panel=$(target);panel.hidden=false;
  panel.innerHTML=componentDetailMarkup(component,{workspace:target==='#component-panel'});
  const visual=panel.querySelector('.component-visual');
  preloadComponentAsset(id).then(()=>visual?.classList.remove('is-loading'));
}
function openFlow(id,scope=document){const c=components[id];const flow=scope.querySelector('.mini-flow');if(!c||!flow)return;flow.hidden=false;flow.innerHTML=`<span><small>上游</small>${c.upstream.map(esc).join(' / ')}</span><i>↓</i><strong>${esc(c.name)}</strong><i>↓</i><span><small>机器人</small>${c.downstream.map(esc).join(' / ')}</span><i>↓</i><span><small>应用</small>${c.applications.map(esc).join(' / ')}</span>`}

const knowledgeSections=[
  {id:'basics',index:'01',title:'机器人基础',topics:['机器人是什么','机器人类型','自由度','工作空间','负载','精度','重复定位精度']},
  {id:'structure',index:'02',title:'机器人组成',topics:['感知系统','执行系统','控制系统','计算系统','电源系统','通信系统']},
  {id:'motion',index:'03',title:'运动系统',topics:['机器人关节','电机','减速器','编码器','伺服系统','驱动器','轴承']},
  {id:'perception',index:'04',title:'感知系统',topics:['2D视觉','3D视觉','深度相机','LiDAR','IMU','六维力传感器','触觉传感器']},
  {id:'control',index:'05',title:'控制系统',topics:['机器人控制器','运动控制','位置控制','速度控制','力控制','轨迹规划']},
  {id:'embodied',index:'06',title:'具身智能',topics:['感知','决策','执行','VLA','世界模型','强化学习','模仿学习','遥操作','数据采集']},
  {id:'industry',index:'07',title:'产业链',topics:['上游','中游','下游']}
];
const topicComponents={'机器人关节':'joint','电机':'motor','减速器':'reducer','编码器':'encoder','伺服系统':'servo','驱动器':'servoDrive','轴承':'bearing','3D视觉':'vision3d','深度相机':'depthCamera','LiDAR':'lidar','IMU':'imu','六维力传感器':'force','触觉传感器':'tactile','机器人控制器':'controller','感知系统':'depthCamera','执行系统':'joint','控制系统':'controller','计算系统':'edgeCompute','电源系统':'battery','力控制':'force','感知':'vision3d','执行':'hand'};
const topicDescriptions={'机器人是什么':'机器人是能够感知环境、处理信息并执行物理动作的系统。它的价值不在于像人，而在于在真实空间中稳定完成任务。','机器人类型':'机器人类型由运动方式、工作环境与任务决定。人形、协作、工业、移动、四足与服务机器人共享基础技术，但性能重点不同。','自由度':'自由度描述机器人可以独立控制的运动轴数。自由度越多，姿态越灵活，控制与标定难度也更高。','产业链':'机器人产业链连接基础材料与芯片、核心零部件、机器人本体，以及最终行业应用。','VLA':'VLA 将视觉、语言和动作放进同一模型，让机器人把自然语言任务转化为可执行动作。','世界模型':'世界模型通过内部表征预测环境与动作后果，为复杂任务规划提供依据。','强化学习':'强化学习通过试错优化策略，适合需要连续决策和动态反馈的机器人任务。','模仿学习':'模仿学习从人类示范或遥操作数据中学习动作策略，能降低复杂技能训练门槛。','遥操作':'遥操作由人实时控制机器人，用于数据采集、危险环境与远程辅助。','数据采集':'高质量、多模态的真实世界数据，是具身智能模型持续改善的基础。'};
function topicSummary(topic){const id=topicComponents[topic],component=components[id];return topicDescriptions[topic]||component?.description||`${topic}是机器人系统中的关键知识节点，连接产品能力、工程实现与实际应用。`}
function topicRelated(topic){const id=topicComponents[topic];if(id)return [id,...components[id].relatedComponents.slice(0,3)];if(topic==='机器人类型'||topic==='中游')return ['human','collaborative','industrial','amr'];if(topic==='上游')return ['reducer','motor','force','vision3d','lidar','controller'];return ['joint','controller','edgeCompute'].filter(id=>components[id])}
function renderLearning(){const selected=state.activeLearningTopic||'basics:机器人是什么';$('#learning-mode').innerHTML=`<div class="knowledge-workspace"><aside class="knowledge-nav"><div><p class="detail-eyebrow">KNOWLEDGE NAVIGATION</p><h2>机器人入门。</h2></div>${knowledgeSections.map(section=>`<section><button class="knowledge-section ${selected.startsWith(section.id+':')?'selected':''}" data-knowledge-section="${section.id}"><span>${section.index}</span>${section.title}</button><div>${section.topics.map(topic=>`<button class="knowledge-topic ${selected===section.id+':'+topic?'selected':''}" data-knowledge-topic="${section.id}:${topic}">${topic}</button>`).join('')}</div></section>`).join('')}</aside><main class="knowledge-content" id="knowledge-content"></main><section class="knowledge-detail glass" id="knowledge-detail" hidden></section></div>`;openKnowledge(selected)}
function openKnowledge(key){
  state.activeLearningTopic=key;
  const [sectionId,topic]=key.split(':');
  const section=knowledgeSections.find(item=>item.id===sectionId);
  const related=topicRelated(topic);
  const componentId=topicComponents[topic];
  const visual=componentId&&components[componentId]?.image
    ?`<img src="${components[componentId].image}" alt="${topic} 产品视觉">`
    :`<div class="knowledge-diagram"><span>${section.title}</span><i>→</i><strong>${topic}</strong><i>→</i><span>应用</span></div>`;
  const facts=[
    ['它是什么？',topicSummary(topic)],
    ['为什么重要？','它直接影响机器人的能力边界、工程可实现性和部署成本。'],
    ['核心原理','通过传感、计算、控制或机械传动，把任务目标转化为可靠的物理行为。'],
    ['机器人在哪里使用？','常见于人形、协作、工业或移动机器人，具体位置取决于任务与系统架构。']
  ];
  $('#knowledge-content').innerHTML=`<div class="knowledge-heading"><p class="detail-eyebrow">${section.index} / ${section.title}</p><h2>${topic}</h2><p class="knowledge-lede">${topicSummary(topic)}</p></div><div class="knowledge-visual">${visual}</div>${sectionId==='industry'?industryMap():`<div class="knowledge-facts">${facts.map(([title,copy])=>`<section><h3>${title}</h3><p>${copy}</p></section>`).join('')}</div><section class="knowledge-related"><p class="detail-eyebrow">RELATED NODES</p><h3>继续探索</h3><div>${related.map(id=>components[id]?`<button data-component="${id}">${components[id].name}<small>${components[id].englishName}</small></button>`:robots[id]?`<button data-knowledge-robot="${id}">${robots[id].name}<small>${robots[id].englishName}</small></button>`:'').join('')}</div></section>`}`;
  document.querySelectorAll('[data-knowledge-section]').forEach(button=>button.classList.toggle('selected',button.dataset.knowledgeSection===sectionId));
  document.querySelectorAll('[data-knowledge-topic]').forEach(button=>button.classList.toggle('selected',button.dataset.knowledgeTopic===key));
}
function industryMap(){const groups=[['上游',['reducer','motor','servo','encoder','joint','bearing','force','tactile','imu','lidar','depthCamera','vision3d','controller','aiCompute','battery']],['中游',['human','collaborative','industrial','amr','quadruped','service']],['下游',['汽车制造','3C电子','新能源','工业制造','仓储物流','商业服务','医疗','科研教育','家庭服务','危险环境','巡检','农业']]];return `<section class="industry-map">${groups.map(([title,nodes],index)=>`<div><p class="detail-eyebrow">${title}</p>${nodes.map(node=>components[node]?`<button data-component="${node}">${components[node].name}</button>`:robots[node]?`<button data-knowledge-robot="${node}">${robots[node].name}</button>`:`<span>${node}</span>`).join('')}</div>${index<2?'<i>↓</i>':''}`).join('')}</section>`}

const saleProducts=['reducer','motor','force','vision3d','joint','hand'];

function activeSalesComponent(){return components[state.activeSalesProduct]||components.force}
function salesGuide(){return salesGuides[state.activeSalesProduct]||salesGuides.force}
function salesNodeButtons(ids,attribute){
  return ids.map(id=>components[id]?`<button ${attribute}="${id}">${components[id].name}<small>${components[id].englishName}</small></button>`:'').join('');
}
function renderSales(){
  const component=activeSalesComponent();
  const guide=salesGuide();
  $('#sales-mode').innerHTML=`<div class="mode-heading sales-heading"><p class="detail-eyebrow">SALES KNOWLEDGE / 01</p><h2>销售助手。</h2><p>从产品、客户与场景开始，准备一次更清楚的销售对话。</p></div><section class="sales-workspace"><div class="sales-product-selector"><p class="selector-label">选择产品</p><div class="product-picker">${saleProducts.map(id=>`<button class="product-choice ${id===state.activeSalesProduct?'selected':''}" data-sales-product="${id}" aria-pressed="${id===state.activeSalesProduct}">${components[id].name}<small>${components[id].englishName}</small></button>`).join('')}</div></div><header class="sales-guide-heading"><p class="detail-eyebrow">${component.englishName}</p><h3>${component.name}</h3><p>${component.description}</p></header><div class="sales-guide-grid"><section class="sales-guide-section sales-guide-pitch"><p class="detail-eyebrow">01 / 30 秒讲明白</p><h4>客户需要理解的价值</h4><p>${guide.pitch}</p></section><section class="sales-guide-section"><p class="detail-eyebrow">02 / 典型客户</p><h4>先找到合适的对话对象</h4><div class="sales-customer-list">${guide.customers.map(([name,reason])=>`<div><strong>${name}</strong><span>${reason}</span></div>`).join('')}</div></section><section class="sales-guide-section sales-guide-questions"><p class="detail-eyebrow">03 / 第一次可以问</p><h4>先理解客户，再介绍产品</h4><ol>${guide.questions.map(question=>`<li>${question}</li>`).join('')}</ol></section><section class="sales-guide-section"><p class="detail-eyebrow">04 / 拜访前准备</p><h4>${guide.visit.goal}</h4><div class="sales-visit-grid"><div><span>需要准备</span><ul>${guide.visit.prepare.map(item=>`<li>${item}</li>`).join('')}</ul></div><div><span>客户可能关注</span><ul>${guide.visit.concerns.map(item=>`<li>${item}</li>`).join('')}</ul></div></div></section></div><section class="sales-relationship"><p class="detail-eyebrow">05 / 销售关系</p><h4>从零部件，走到可验证的客户场景</h4><div class="sales-flow"><button data-sales-component="${component.entityKey||state.activeSalesProduct}">${component.name}<small>零部件</small></button><i>→</i><div class="sales-flow-group">${guide.relatedRobots.map(id=>robots[id]?`<button data-sales-robot="${id}">${robots[id].name}<small>机器人类型</small></button>`:'').join('')}</div><i>→</i><div class="sales-flow-group">${component.applications.slice(0,3).map(name=>`<span>${name}</span>`).join('')}</div></div><div class="sales-related-components"><span>关联零部件</span>${salesNodeButtons(guide.relatedComponents,'data-sales-component')}</div></section></section>`;
}

let searchResults=[];
function renderSearch(){const q=$('#search-input').value.trim().toLowerCase();const entries=[...Object.values(robots).map(r=>({label:r.name,type:'机器人',id:r.id,why:r.description})),...Object.entries(components).map(([id,c])=>({label:c.name,type:c.category,id,why:`${c.function} · 销售：客户、需求、场景`})),{label:'我要卖减速器',type:'销售知识',id:'reducer',why:'减速器 → 机器人关节 → 人形、协作、工业机器人'},{label:'客户做灵巧手',type:'销售知识',id:'hand',why:'灵巧手 → 力传感器、触觉传感器、微型电机'}];searchResults=entries.filter(x=>!q||`${x.label} ${x.type} ${x.why}`.toLowerCase().includes(q)).slice(0,10);$('#search-results').innerHTML=searchResults.map((x,i)=>`<button class="result" data-result="${i}"><span>${esc(x.label)}<small>${esc(x.type)}</small></span><em>${esc(x.why)}</em></button>`).join('')||'<p class="empty-result">没有匹配项。</p>'}
function openSearch(){$('#search-input').value='';renderSearch();$('#search-dialog').showModal();$('#search-input').focus()}

document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setSection(button.dataset.view)));
$('.wordmark').addEventListener('click',event=>{event.preventDefault();setSection('atlas');changeRobot('human')});
$('#robot-selector').addEventListener('click',event=>{const button=event.target.closest('[data-robot]');if(button)changeRobot(button.dataset.robot)});
$('#hotspots').addEventListener('click',event=>{const button=event.target.closest('[data-hotspot]');if(!button)return;const point=activeRobot().hotspots.find(item=>item.id===button.dataset.hotspot);if(point)openSystem(point)});
$('#hotspots').addEventListener('pointerover',event=>{const button=event.target.closest('[data-hotspot]');if(!button)return;const point=activeRobot().hotspots.find(item=>item.id===button.dataset.hotspot);if(point)prefetchComponentAssets(componentsForSystem(point.system))});
$('#component-panel').addEventListener('click',event=>{if(event.target.closest('[data-close-component]'))closeWorkspacePanel();const component=event.target.closest('[data-component]');if(component)openComponent(component.dataset.component);if(event.target.closest('[data-back-system]')){const hotspot=activeRobot().hotspots.find(point=>point.id===state.activeHotspot)||activeRobot().hotspots[0];openSystem(hotspot)}const flow=event.target.closest('[data-component-flow]');if(flow)openFlow(flow.dataset.componentFlow,$('#component-panel'))});
$('#learning-mode').addEventListener('click',event=>{const topic=event.target.closest('[data-knowledge-topic]');if(topic){openKnowledge(topic.dataset.knowledgeTopic);return}const section=event.target.closest('[data-knowledge-section]');if(section){const first=knowledgeSections.find(item=>item.id===section.dataset.knowledgeSection)?.topics[0];if(first)openKnowledge(`${section.dataset.knowledgeSection}:${first}`);return}const robot=event.target.closest('[data-knowledge-robot]');if(robot){setSection('atlas');changeRobot(robot.dataset.knowledgeRobot);return}const component=event.target.closest('[data-component]');if(component){openComponent(component.dataset.component,'#knowledge-detail');return}if(event.target.closest('[data-close-component]')){$('#knowledge-detail').hidden=true;return}const flow=event.target.closest('[data-component-flow]');if(flow)openFlow(flow.dataset.componentFlow,$('#knowledge-detail'))});
$('#sales-mode').addEventListener('click',event=>{const product=event.target.closest('[data-sales-product]');if(product){state.activeSalesProduct=product.dataset.salesProduct;renderSales();return}const component=event.target.closest('[data-sales-component]');if(component){setSection('atlas');openComponent(component.dataset.salesComponent);return}const robot=event.target.closest('[data-sales-robot]');if(robot){setSection('atlas');changeRobot(robot.dataset.salesRobot)}});
$('#search-trigger').addEventListener('click',openSearch);$('#search-input').addEventListener('input',renderSearch);$('#search-results').addEventListener('click',event=>{const button=event.target.closest('[data-result]');if(!button)return;const result=searchResults[Number(button.dataset.result)];$('#search-dialog').close();if(robots[result.id]){setSection('atlas');changeRobot(result.id)}else{setSection('atlas');openComponent(result.id)}});document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.close).close()));
document.addEventListener('keydown',event=>{if(event.key==='/'&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA'].includes(event.target.tagName)){event.preventDefault();openSearch()}if(event.key==='Escape'&&!$('#component-panel').hidden)closeWorkspacePanel()});
preloadRobotAssets();
setSection('atlas');renderAtlas();
