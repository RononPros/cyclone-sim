// A bounded game approximation of directional terrain shelter. It samples
// higher ground upwind, rather than treating all lowlands as sheltered.
const WindShelter = (()=>{
    const DIRECTIONS=32,MAX_POINTS=50000;
    const FETCH_KM=[5,10,20,35,55,80,110,150,200];
    const cache=new WeakMap();
    const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
    const height=t=>t>0?clamp((t-0.5)/0.5,0,1):0;
    function destination(coord,km,bearing){
        const lat=coord.latitude*Math.PI/180,lon=coord.longitude*Math.PI/180,d=km/6371;
        const latitude=Math.asin(clamp(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(bearing),-1,1));
        const longitude=lon+Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(lat),
            Math.cos(d)-Math.sin(lat)*Math.sin(latitude));
        return new Coordinate(longitude*180/Math.PI,latitude*180/Math.PI);
    }
    function known(basin,coord){
        if(MAP_TYPES[basin.mapType].form==='earth')return true;
        const b=MAP_TYPES[6],east=b.east<b.west?b.east+360:b.east;
        const longitude=coord.longitude+360*Math.round(((b.west+east)/2-coord.longitude)/360);
        return longitude>=b.west && longitude<=east && coord.latitude>=b.south && coord.latitude<=b.north;
    }
    function factor(basin,coord,terrain,east,north){
        if(!basin || !land || typeof land.get!=='function' || !Number.isFinite(east) ||
            !Number.isFinite(north) || Math.hypot(east,north)<1e-8)return 1;
        let maps=cache.get(land);
        if(!maps){maps=new Map();cache.set(land,maps);}
        let points=maps.get(basin.mapType);
        if(!points){points=new Map();maps.set(basin.mapType,points);}
        const key=coord.longitude.toFixed(5)+','+coord.latitude.toFixed(5)+':'+terrain;
        let samples=points.get(key);
        if(!samples){
            if(points.size>=MAX_POINTS)points.delete(points.keys().next().value);
            samples=new Float64Array(DIRECTIONS);samples.fill(NaN);points.set(key,samples);
        }
        // Bearing points toward the source of the local wind. Interpolating
        // adjacent cached directions keeps shelter smooth as the storm turns.
        const angle=(Math.atan2(-east,-north)+Math.PI*2)%(Math.PI*2);
        const direction=angle/(Math.PI*2)*DIRECTIONS,low=Math.floor(direction),mix=direction-low;
        const localHeight=height(terrain);
        function obstruction(index){
            index%=DIRECTIONS;
            if(Number.isFinite(samples[index]))return samples[index];
            let strongest=0;
            for(const km of FETCH_KM){
                const upwind=destination(coord,km,index/DIRECTIONS*Math.PI*2);
                if(!known(basin,upwind))continue;
                const barrier=clamp((height(land.get(upwind))-localHeight-0.08)/0.92,0,1);
                strongest=Math.max(strongest,barrier*Math.exp(-km/85));
            }
            samples[index]=strongest;return strongest;
        }
        const obstructionLow=obstruction(low);
        const barrier=obstructionLow+(obstruction(low+1)-obstructionLow)*mix;
        return 1-0.38*barrier;
    }
    return {factor,destination};
})();
