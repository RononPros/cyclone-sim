// Player-authored SST adjustments. Revisions are effective at their simulated
// hour, so editing the present never rewrites earlier environmental analyses.
const TemperatureAdjustments = (()=>{
    const GLOBAL_MIN = -5, GLOBAL_MAX = 5;
    const BUBBLE_MIN = -10, BUBBLE_MAX = 10;
    const RADIUS_MIN = 100, RADIUS_MAX = 2500;
    const MAX_BUBBLES = 64;
    const undoStacks = new WeakMap();
    const clamp = (value,low,high,fallback=0)=>{
        value = Number(value);
        return Number.isFinite(value) ? Math.min(high,Math.max(low,value)) : fallback;
    };
    const temperature = (value,low,high)=>Math.round(clamp(value,low,high)*10)/10;
    const copyState = state=>({globalOffset:state.globalOffset,bubbles:state.bubbles.map(b=>({...b}))});
    const create = (offset=0)=>({version:1,showBubbles:true,revisions:[
        {tick:0,globalOffset:temperature(offset,GLOBAL_MIN,GLOBAL_MAX),bubbles:[]}
    ]});

    function normalizeState(value={}){
        const bubbles=[],ids=new Set();
        for(const b of Array.isArray(value.bubbles) ? value.bubbles : []){
            if(!b || !Number.isSafeInteger(b.id) || b.id<1 || ids.has(b.id) ||
                !Number.isFinite(b.longitude) || !Number.isFinite(b.latitude) ||
                !Number.isFinite(b.anomaly) || !Number.isFinite(b.radiusKm)) continue;
            ids.add(b.id);
            bubbles.push({id:b.id,longitude:((b.longitude+180)%360+360)%360-180,
                latitude:clamp(b.latitude,-90,90),
                anomaly:temperature(b.anomaly,BUBBLE_MIN,BUBBLE_MAX),
                radiusKm:Math.round(clamp(b.radiusKm,RADIUS_MIN,RADIUS_MAX))});
            if(bubbles.length===MAX_BUBBLES) break;
        }
        return {globalOffset:temperature(value.globalOffset,GLOBAL_MIN,GLOBAL_MAX),bubbles};
    }

    function normalize(value,maxTick=Infinity){
        if(!value || value.version!==1 || !Array.isArray(value.revisions)) return create();
        const revisions=new Map();
        for(const r of value.revisions){
            if(r && Number.isSafeInteger(r.tick) && r.tick>=0 && r.tick<=maxTick)
                revisions.set(r.tick,{tick:r.tick,...normalizeState(r)});
        }
        if(!revisions.has(0)) revisions.set(0,create().revisions[0]);
        return {version:1,showBubbles:value.showBubbles!==false,
            revisions:Array.from(revisions.values()).sort((a,b)=>a.tick-b.tick)};
    }

    function stateAt(basin,tick=basin.tick){
        const revisions=basin.temperatureAdjustments && basin.temperatureAdjustments.revisions;
        if(!revisions || !revisions.length || tick<0) return {globalOffset:0,bubbles:[]};
        let low=0,high=revisions.length;
        while(low<high){
            const middle=(low+high)>>>1;
            if(revisions[middle].tick<=tick) low=middle+1;
            else high=middle;
        }
        return low ? revisions[low-1] : {globalOffset:0,bubbles:[]};
    }

    function distanceKm(a,b){
        const radians=Math.PI/180;
        const lat1=a.latitude*radians,lat2=b.latitude*radians;
        const dlat=lat2-lat1,dlon=(b.longitude-a.longitude)*radians;
        const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
        return 12742*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
    }

    function offsetAt(basin,x,y,tick){
        const state=stateAt(basin,tick);
        let offset=state.globalOffset;
        if(!state.bubbles.length) return offset;
        const coord=Coordinate.convertFromXY(basin.mapType,x,y);
        for(const bubble of state.bubbles){
            const q=distanceKm(coord,bubble)/bubble.radiusKm;
            // Compact smoothstep: exact centre value and zero outside the radius,
            // with zero slope at both ends. Warm and cold contributions add.
            if(q<1) offset+=bubble.anomaly*(1-q*q*(3-2*q));
        }
        return offset;
    }

    function commit(basin,value,recordUndo=true){
        if(!basin.temperatureAdjustments) basin.temperatureAdjustments=create();
        if(!Number.isSafeInteger(basin.tick) || basin.tick<basin.temperatureAdjustments.revisions.at(-1).tick) return false;
        const before=copyState(stateAt(basin));
        const next=normalizeState(value);
        if(JSON.stringify(before)===JSON.stringify(next)) return false;
        if(recordUndo){
            const stack=undoStacks.get(basin)||[];
            stack.push(before);
            if(stack.length>50) stack.shift();
            undoStacks.set(basin,stack);
        }
        const revisions=basin.temperatureAdjustments.revisions;
        const revision={tick:basin.tick,...next};
        if(revisions[revisions.length-1].tick===basin.tick) revisions[revisions.length-1]=revision;
        else revisions.push(revision);
        basin.lastSaved=-1;
        return true;
    }

    function setGlobal(basin,value){
        return commit(basin,{...stateAt(basin),globalOffset:value});
    }

    function addBubble(basin,coord,anomaly=3,radiusKm=500){
        const state=stateAt(basin);
        if(state.bubbles.length>=MAX_BUBBLES) return null;
        let id=1;
        for(const r of basin.temperatureAdjustments ? basin.temperatureAdjustments.revisions : [])
            for(const b of r.bubbles) id=Math.max(id,b.id+1);
        commit(basin,{...state,bubbles:[...state.bubbles,
            {id,longitude:coord.longitude,latitude:coord.latitude,anomaly,radiusKm}]});
        return id;
    }

    function updateBubble(basin,id,changes){
        const state=stateAt(basin);
        return commit(basin,{...state,bubbles:state.bubbles.map(b=>b.id===id ? {...b,...changes,id} : b)});
    }

    function removeBubble(basin,id){
        const state=stateAt(basin);
        return commit(basin,{...state,bubbles:state.bubbles.filter(b=>b.id!==id)});
    }

    function undo(basin){
        const stack=undoStacks.get(basin);
        return !!(stack && stack.length && commit(basin,stack.pop(),false));
    }

    function setVisible(basin,visible){
        if(!basin.temperatureAdjustments) basin.temperatureAdjustments=create();
        basin.temperatureAdjustments.showBubbles=!!visible;
        basin.lastSaved=-1;
    }

    return {GLOBAL_MIN,GLOBAL_MAX,BUBBLE_MIN,BUBBLE_MAX,RADIUS_MIN,RADIUS_MAX,MAX_BUBBLES,
        create,normalize,stateAt,copyState,distanceKm,offsetAt,commit,setGlobal,addBubble,
        updateBubble,removeBubble,undo,setVisible,
        canUndo:basin=>!!(undoStacks.get(basin)||[]).length,
        serialize:basin=>normalize(basin.temperatureAdjustments,basin.tick)};
})();
