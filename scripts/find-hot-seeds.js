// First-year SST-anomaly search for Normal / Western Pacific.
// The ocean grid matches the displayed 20-unit map cells. Screening is coarse;
// retained candidates are refined daily, then hourly. Results are the strongest
// found in this finite search, not a proof of a global maximum over all seeds.
const fs=require('node:fs');
const path=require('node:path');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {loadSimulation}=require('../tests/helpers/simulation');
const grid=require('./data/wpac-ocean-grid.json');

function scanSeeds(seeds,interval,year,onProgress=()=>{}){
    const s=loadSimulation(),a=s.api;
    const hours=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/3600000;
    const rows=[];
    for(let index=0;index<seeds.length;index++){
        const seed=seeds[index];
        s.context.noiseSeed(seed);
        const basin=a.makeBasin(8,a.normal,seed);
        basin.tick=0;basin.startYear=year;basin.env=new a.Environment(basin);basin.env.init();
        const field=basin.env.fields.SSTAnomaly,channel=field.noise[0];
        s.context.noiseDetail(channel.octaves,channel.falloff);
        const points=grid.points.map(([x,y])=>({x,y,nx:x/channel.zoom,ny:y/channel.zoom,tropical:59.45*(1-y/540)>=5 && 59.45*(1-y/540)<=30}));
        let nx=0,ny=0,nz=0;
        const utility={basin,modifiers:field.modifiers,noise:()=>s.context.noise(nx,ny,nz)};
        let peak={anomaly:-Infinity},tropicalPeak={anomaly:-Infinity};
        for(let hour=0;hour<hours;hour++){
            basin.tick=hour;
            if(hour>0)channel.wobble();
            if(hour%interval!==0 && hour!==hours-1)continue;
            nz=hour/channel.zZoom+channel.zOff;
            for(const point of points){
                nx=point.nx+channel.xOff;ny=point.ny+channel.yOff;
                const anomaly=field.mapFunc(utility,point.x,point.y,hour);
                if(anomaly>peak.anomaly)
                    peak={anomaly,hour,x:point.x,y:point.y,channel:channel.save()};
                if(point.tropical && anomaly>tropicalPeak.anomaly)
                    tropicalPeak={anomaly,hour,x:point.x,y:point.y,channel:channel.save()};
            }
        }
        const finish=p=>{
            basin.tick=p.hour;
            channel.load(new a.LoadData(a.SAVE_FORMAT,p.channel));
            const actual=basin.env.get('SSTAnomaly',p.x,p.y,p.hour);
            if(Math.abs(actual-p.anomaly)>1e-9)throw new Error('Fast sampler diverged from the game');
            const coord=a.Coordinate.convertFromXY(8,p.x,p.y);
            return {anomaly:p.anomaly,SST:basin.env.get('SST',p.x,p.y,p.hour),hour:p.hour,
                dateUTC:new Date(Date.UTC(year,0,1)+p.hour*3600000).toISOString(),
                longitude:coord.longitude,latitude:coord.latitude,x:p.x,y:p.y};
        };
        rows.push({seed,peak:finish(peak),tropicalPeak:finish(tropicalPeak)});
        if((index+1)%25===0 || index+1===seeds.length)onProgress(index+1);
    }
    return rows;
}

const highest=(rows,key,count)=>rows.slice().sort((a,b)=>b[key].anomaly-a[key].anomaly || a.seed-b.seed).slice(0,count);
const finalists=(rows,count)=>Array.from(new Set([...highest(rows,'peak',count),...highest(rows,'tropicalPeak',count)].map(row=>row.seed)));

async function parallelScan(seeds,interval,year,workers,label){
    const chunks=Array.from({length:Math.min(workers,seeds.length)},()=>[]);
    seeds.forEach((seed,index)=>chunks[index%chunks.length].push(seed));
    const counts=chunks.map(()=>0);
    let lastReported=0;
    const parts=await Promise.all(chunks.map((chunk,index)=>new Promise((resolve,reject)=>{
        const worker=new Worker(__filename,{workerData:{seeds:chunk,interval,year}});
        worker.on('message',message=>{
            if(message.progress!==undefined){
                counts[index]=message.progress;
                const done=counts.reduce((a,b)=>a+b,0);
                if(done-lastReported>=Math.max(25,Math.ceil(seeds.length/10)) || done===seeds.length){
                    process.stderr.write(label+': '+done+'/'+seeds.length+'\n');lastReported=done;
                }
            }else if(message.rows)resolve(message.rows);
        });
        worker.on('error',reject);
        worker.on('exit',code=>{if(code!==0)reject(new Error('Search worker exited '+code));});
    })));
    return parts.flat();
}

async function main(){
    const options={count:5000,workers:4,year:2026,top:5,candidates:50,output:null};
    for(let i=2;i<process.argv.length;i+=2){
        const key=process.argv[i].replace(/^--/,'');
        if(!(key in options) || process.argv[i+1]===undefined)throw new Error('Unknown/incomplete option '+process.argv[i]);
        options[key]=key==='output'?process.argv[i+1]:Number(process.argv[i+1]);
    }
    for(const key of ['count','workers','year','top','candidates'])
        if(!Number.isInteger(options[key]) || options[key]<1)throw new Error('Invalid '+key);
    if(options.year<1900 || options.year>9998)throw new Error('Year must be between 1900 and 9998');
    if(options.workers>16)throw new Error('Use at most 16 workers');
    const seeds=Array.from({length:options.count},(_,i)=>i+1);
    const coarse=await parallelScan(seeds,672,options.year,options.workers,'First-year screen');
    const daily=await parallelScan(finalists(coarse,options.candidates),24,options.year,options.workers,'Daily refinement');
    const hourly=await parallelScan(finalists(daily,options.top),1,options.year,options.workers,'Hourly refinement');
    const result={model:'Raptor Mod 0.18.1 / environment-v1',map:'Western Pacific',mode:'Normal',
        firstYear:options.year,hours:(Date.UTC(options.year+1,0,1)-Date.UTC(options.year,0,1))/3600000,
        seedRange:[1,options.count],oceanGrid:{step:grid.step,points:grid.points.length,sourceGitBlob:grid.sourceGitBlob},
        sampling:{screenHours:672,dailyHours:24,finalHours:1,candidatesDaily:daily.length,candidatesHourly:hourly.length},
        overall:highest(hourly,'peak',options.top),tropical:highest(hourly,'tropicalPeak',options.top)};
    if(options.output){fs.mkdirSync(path.dirname(options.output),{recursive:true});fs.writeFileSync(options.output,JSON.stringify(result,null,2)+'\n');}
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
}

if(!isMainThread){
    const rows=scanSeeds(workerData.seeds,workerData.interval,workerData.year,progress=>parentPort.postMessage({progress}));
    parentPort.postMessage({rows});
}else if(require.main===module){
    main().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={scanSeeds,highest,finalists};
