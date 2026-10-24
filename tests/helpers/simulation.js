// Headless harness: real application scripts, bundled p5 noise and Moment;
// only canvas/DOM drawing and the p5 vector API are supplied by this harness.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'../..');

function loadSimulation(){
    const storage = new Map();
    let randomState = 1;
    const uniform = ()=>{
        randomState = (Math.imul(randomState,1664525)+1013904223)>>>0;
        return randomState/4294967296;
    };
    class Vector{
        constructor(x=0,y=0){ this.x=x; this.y=y; }
        set(x,y){
            if(x && typeof x==='object'){ this.x=x.x; this.y=x.y; }
            else{ this.x=x||0; this.y=y||0; }
            return this;
        }
        copy(){ return new Vector(this.x,this.y); }
        add(x,y){ if(x && typeof x==='object'){ this.x+=x.x; this.y+=x.y; }else{ this.x+=x||0; this.y+=y||0; } return this; }
        sub(x,y){ if(x && typeof x==='object'){ this.x-=x.x; this.y-=x.y; }else{ this.x-=x||0; this.y-=y||0; } return this; }
        mult(f){ this.x*=f; this.y*=f; return this; }
        mag(){ return Math.sqrt(this.x*this.x+this.y*this.y); }
        heading(){ return Math.atan2(this.y,this.x); }
        rotate(a){ const x=this.x; this.x=x*Math.cos(a)-this.y*Math.sin(a); this.y=x*Math.sin(a)+this.y*Math.cos(a); return this; }
        setMag(m){ const length=this.mag(); if(length) this.mult(m/length); return this; }
        static random2D(){ const a=uniform()*2*Math.PI; return new Vector(Math.cos(a),Math.sin(a)); }
    }
    function P5(){}
    P5.Vector = Vector;
    const drawing = ()=>new Proxy({width:960,height:540},{get:(obj,key)=>key in obj?obj[key]:(()=>{})});
    const versionElement = {tagName:'A',setAttribute(){}};
    const context = vm.createContext({
        console,performance,Math,p5:P5,
        addEventListener(){},
        setTimeout:()=>0,clearTimeout(){},
        localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
        document:{getElementById:()=>versionElement},
        createVector:(x,y)=>new Vector(x,y),createGraphics:drawing,
        color:()=>({}),lerpColor:()=>({}),
        randomSeed:seed=>{randomState=seed>>>0;},
        random:(a,b)=>Array.isArray(a)?a[Math.floor(uniform()*a.length)]:b===undefined?uniform()*(a===undefined?1:a):a+(b-a)*uniform(),
        randomGaussian:()=>Math.sqrt(-2*Math.log(Math.max(1e-12,uniform())))*Math.cos(2*Math.PI*uniform()),
        map:(v,a,b,c,d,clamp)=>{const t=(v-a)/(b-a);return c+(d-c)*(clamp?Math.max(0,Math.min(1,t)):t);},
        constrain:(v,a,b)=>Math.max(a,Math.min(b,v)),lerp:(a,b,t)=>a+(b-a)*t,
        floor:Math.floor,ceil:Math.ceil,round:Math.round,min:Math.min,max:Math.max,
        abs:Math.abs,sqrt:Math.sqrt,pow:Math.pow,log:Math.log,sq:x=>x*x,
        sin:Math.sin,cos:Math.cos,atan:Math.atan,atan2:Math.atan2,
        PI:Math.PI,TAU:2*Math.PI,HALF_PI:Math.PI/2,
        LEFT:'left',RIGHT:'right',CENTER:'center',TOP:'top',BOTTOM:'bottom',
        NORMAL:'normal',BOLD:'bold',RGB:'rgb',HSB:'hsb',CLOSE:'close',
        textWidth:value=>String(value).length*6,
        mouseX:0,mouseY:0,key:'',keyCode:0,keyIsDown:()=>false,
        displayWidth:960,displayHeight:540,windowWidth:960,windowHeight:540
    });
    vm.runInContext('var window=globalThis;',context);
    // Execute only the standalone noise module from the pinned Browserify bundle.
    // This avoids emulating a browser for p5's drawing/bootstrap code.
    const bundle = fs.readFileSync(path.join(root,'dependencies/p5-1.9.1.min.js'),'utf8');
    const noiseStart = bundle.indexOf('312:[function(e,t,r){');
    const noiseEnd = bundle.indexOf('},{"../core/main":280}],313:',noiseStart);
    if(noiseStart<0 || noiseEnd<0) throw new Error('Pinned p5 1.9.1 noise module not found');
    const noiseBody = bundle.slice(noiseStart+'312:[function(e,t,r){'.length,noiseEnd);
    new Function('e','t','r',noiseBody)(()=>P5,{},{});
    for(const key of ['noise','noiseDetail','noiseSeed']) context[key] = P5.prototype[key];
    vm.runInContext(`
        globalThis.drawCalls=[];
        const drawingState={size:12,align:'left'};
        const drawingStack=[];
        for(const key of ['fill','stroke','noStroke','noFill','strokeWeight','rect','line','point','ellipse','beginShape','endShape','vertex','textStyle','textFont','colorMode','translate'])
            globalThis[key]=function(){};
        globalThis.push=function(){drawingStack.push(Object.assign({},drawingState));};
        globalThis.pop=function(){Object.assign(drawingState,drawingStack.pop()||{});};
        globalThis.textAlign=function(align){drawingState.align=align;};
        globalThis.textSize=function(size){drawingState.size=size;};
        globalThis.text=function(value,x,y){drawCalls.push({value:String(value),x,y,size:drawingState.size,align:drawingState.align});};
    `,context);

    const index = fs.readFileSync(path.join(root,'index.html'),'utf8');
    for(const match of index.matchAll(/<script src="([^"?]+)(?:\?[^\"]*)?"/g)){
        const file = match[1].replace(/^\.\//,'');
        if(file==='dependencies/p5-1.9.1.min.js' || file.startsWith('dependencies/dexie')) continue;
        vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
    }
    vm.runInContext(`
        buffers = new Map();
        seasonCurve = seasonalSine;
        simSettings = {pressureDeepeningRate:1.96,windIntensificationRate:5.6,trackMode:0,stormDebugMode:false};
        land = {get:()=>0,getSubBasin:()=>0};
        globalThis.testAPI = {
            LandInteraction,TemperatureAdjustments,TemperatureEditor,Coordinate,Environment,EnvNoiseChannel,ActiveSystem,Storm,Basin,Season,LoadData,
            algorithms:STORM_ALGORITHM,envDefs:ENV_DEFS,activeAttributes:ACTIVE_ATTRIBS,
            modes:SIMULATION_MODES,normal:SIM_MODE_NORMAL,calm:SIM_MODE_CALM,experimental:SIM_MODE_EXPERIMENTAL,
            TROP,SUBTROP,TROPWAVE,EXTROP,SAVE_FORMAT,UI,
            setLand(fn){ land={get:fn,getSubBasin:()=>0}; },
            setSettings(values){ Object.assign(simSettings,values); },
            makeBasin(mapType=6,mode=SIM_MODE_NORMAL,seed=1){
                const basin=Object.create(Basin.prototype);
                Object.assign(basin,{mapType,actMode:mode,seed,tick:1,startYear:2026,SHem:false,activeSystems:[],seasons:{},subBasins:{}});
                const season=new Season(basin);
                basin.seasons[2026]=season;
                basin.getSeason=()=>2026;
                basin.fetchSeason=()=>season;
                basin.forSubBasinChain=()=>[];
                return basin;
            },
            makeSystem(basin,longitude=-50,latitude=20,values={}){
                const sys=Object.create(ActiveSystem.prototype);
                Object.assign(sys,{basin,pos:Coordinate.convertToXY(basin.mapType,longitude,latitude),
                    pressure:950,windSpeed:100,type:TROP,organization:0.9,lowerWarmCore:1,upperWarmCore:1,depth:0.7,
                    steering:createVector(),interaction:{shear:0,kill:0,fuji:createVector()},kill:false,trackForecast:[],
                    landInfluence:0,landExposureHours:0,landInteractionInitialized:0,manualGenesisAssistHours:0},values);
                const storm=new Storm(basin,sys);
                sys.storm=storm;
                sys.advisory=()=>{};
                return sys;
            },
            fixedEnvironment(sys,values={}){
                const fields=Object.assign({SST:29,moisture:0.65,jetstream:100,shear:createVector(1,0),LLSteering:createVector(),ULSteering:createVector()},values);
                sys.basin.env={get:field=>fields[field]};
                return {f:field=>fields[field],land:()=>land.get(sys.coord())};
            },
            move(sys,longitude,latitude){ sys.pos=Coordinate.convertToXY(sys.basin.mapType,longitude,latitude); },
            readDebug(sys){return window.__raptorStormDebug.readSample(sys);}
        };
    `,context);
    return {context,api:context.testAPI,evaluate:code=>vm.runInContext(code,context)};
}

module.exports = {loadSimulation};
