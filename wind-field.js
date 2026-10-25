// A bounded, asymmetric cyclone wind footprint for game estimates. Wind speeds
// are one-minute sustained knots, matching ActiveSystem.windSpeed internally.
const WindField = (()=>{
    const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
    const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
    const backgroundCache=new WeakMap();
    function sizeFor(basin,storm){
        const key='wind-size-v1:'+basin.seed+':'+(storm && storm.id)+':'+(storm && storm.birthTime);
        let hash=2166136261;
        for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619)>>>0;
        return 0.75+hash/4294967296*0.65;
    }
    function ensure(system){
        if(!Number.isFinite(system.windSize) || system.windSize<0.5 || system.windSize>2)
            system.windSize=sizeFor(system.basin,system.fetchStorm());
        return system.windSize;
    }
    function boundMotion(east,north){
        east=finite(east);north=finite(north);
        const speed=Math.hypot(east,north),scale=speed>100?100/speed:1;
        return {east:east*scale,north:north*scale};
    }
    function motionBetween(from,to,hours=1){
        if(!(hours>0))return {east:0,north:0};
        const speed=TemperatureAdjustments.distanceKm(from,to)/hours/1.852;
        if(speed<1e-8)return {east:0,north:0};
        const a=from.latitude*Math.PI/180,b=to.latitude*Math.PI/180;
        const dl=(to.longitude-from.longitude)*Math.PI/180;
        const bearing=Math.atan2(Math.sin(dl)*Math.cos(b),
            Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(dl));
        return boundMotion(speed*Math.sin(bearing),speed*Math.cos(bearing));
    }
    function recordMotion(system,previousCoord){
        const motion=motionBetween(previousCoord,system.coord());
        system.windMotionEast=motion.east;system.windMotionNorth=motion.north;
    }
    function motionFor(data,storm){
        if(Number.isFinite(data.windMotionEast) && Number.isFinite(data.windMotionNorth))
            return boundMotion(data.windMotionEast,data.windMotionNorth);
        // Old advisories can estimate motion from the preceding track segment.
        // An old active save uses its latest complete segment until it advances.
        const record=storm && storm.record;
        if(Array.isArray(record)){
            let index=record.indexOf(data);
            if(index<0 && storm.current===data)index=record.length-1;
            if(index>0)return motionBetween(record[index-1].coord(),record[index].coord(),ADVISORY_TICKS);
        }
        return {east:0,north:0};
    }
    function profile(data,storm){
        const maximum=Math.max(0,finite(data.windSpeed));
        const size=Number.isFinite(data.windSize) && data.windSize>=0.5 && data.windSize<=2 ? data.windSize : sizeFor(data.basin,storm);
        const tropical=data.type===TROP || data.type===SUBTROP;
        // Preserve the established lower-intensity profile, then stop core
        // contraction cancelling outer-wind strengthening above 200 km/h.
        const coreWind=Math.min(maximum,200/1.852);
        const rmw=clamp(clamp(tropical?65-coreWind*0.22:85,18,85)*size,12,170);
        // Broaden the outer circulation without inflating the maximum wind or
        // the eyewall. The taper reaches calm gradually at the outer boundary.
        const outer=clamp((450+maximum*7)*size*(tropical?1:1.35),600,3000);
        const motion=motionFor(data,storm),motionSpeed=Math.hypot(motion.east,motion.north);
        const contribution=Math.min(0.65*motionSpeed,maximum*0.3);
        const translation=motionSpeed>0?{
            east:motion.east/motionSpeed*contribution,north:motion.north/motionSpeed*contribution
        }:{east:0,north:0};
        return {maximum,size,rmw,outer,exponent:tropical?0.5:0.45,
            eye:tropical && maximum>=64?0.08:0.5,
            coord:data.coord(),storm,data,basin:data.basin,motion,translation,
            circulation:maximum-contribution,spin:data.basin.SHem?-1:1};
    }
    function profiles(basin,tick=basin.tick){
        if(tick===basin.tick)return basin.activeSystems.filter(s=>!s.kill).map(s=>{
            ensure(s);return profile(s,s.fetchStorm());
        });
        const season=basin.fetchSeason(tick,true);
        if(!season || typeof season.forSystems!=='function')return [];
        const result=[];
        for(const storm of season.forSystems(true)){
            const data=storm.getStormDataByTick(tick,true);
            if(data)result.push(profile(data,storm));
        }
        return result;
    }
    function terrainFactor(terrain){
        if(!(terrain>0))return 1;
        // Keep lowlands close to the open-water wind. The elevation penalty
        // grows gently near sea level, with stronger sheltering higher up.
        const height=clamp((terrain-0.5)/0.5,0,1);
        return 0.95-0.3*Math.pow(height,1.5);
    }
    function vectorAt(p,coord,terrain=0){
        const zero={east:0,north:0,wind:0};
        if(!p.maximum)return zero;
        const distance=TemperatureAdjustments.distanceKm(p.coord,coord);
        if(distance>=p.outer)return zero;
        let fraction;
        if(distance<=p.rmw)fraction=p.eye+(1-p.eye)*Math.pow(distance/p.rmw,0.75);
        else fraction=Math.pow(p.rmw/distance,p.exponent);
        if(distance>p.outer*0.65){
            const q=(distance/p.outer-0.65)/0.35;
            fraction*=1-q*q*(3-2*q);
        }
        // Local east/north axes at the sampled point; spherical bearings keep
        // direction correct across the dateline and in both hemispheres.
        const a=coord.latitude*Math.PI/180,b=p.coord.latitude*Math.PI/180;
        const dl=(p.coord.longitude-coord.longitude)*Math.PI/180;
        const toward=Math.atan2(Math.sin(dl)*Math.cos(b),
            Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(dl));
        const radialEast=distance>1e-8?-Math.sin(toward):0;
        const radialNorth=distance>1e-8?-Math.cos(toward):1;
        const inflow=15*Math.PI/180,cos=Math.cos(inflow),sin=Math.sin(inflow);
        const flowEast=-radialNorth*p.spin*cos-radialEast*sin;
        const flowNorth=radialEast*p.spin*cos-radialNorth*sin;
        const east=(p.circulation*flowEast+p.translation.east)*fraction;
        const north=(p.circulation*flowNorth+p.translation.north)*fraction;
        // Translation redistributes a reported maximum; it cannot add a second
        // peak on top. Both vector terms taper with the radial circulation.
        const reduction=terrainFactor(terrain)*WindShelter.factor(p.basin,coord,terrain,east,north);
        const e=east*reduction,n=north*reduction;
        return {east:e,north:n,wind:Math.hypot(e,n)};
    }
    const windAt=(p,coord,terrain=0)=>vectorAt(p,coord,terrain).wind;
    function strongest(profiles,coord,terrain=0){
        let wind=0,source=null;
        for(const p of profiles){const local=windAt(p,coord,terrain);if(local>wind){wind=local;source=p;}}
        return {wind,source};
    }
    function backgroundAt(basin,coord,terrain=0,tick=basin.tick){
        // Isolated model fixtures may omit environmental weather entirely.
        if(!basin.env || !basin.env.fields || !basin.env.fields.surfaceWind)return 0;
        let cache=backgroundCache.get(basin);
        if(!cache || cache.tick!==tick || cache.env!==basin.env || cache.land!==land){
            cache={tick,env:basin.env,land,values:new Map()};backgroundCache.set(basin,cache);
        }
        const key=coord.longitude+','+coord.latitude+':'+terrain;
        if(cache.values.has(key))return cache.values.get(key);
        const p=Coordinate.convertToXY(basin.mapType,coord.longitude,coord.latitude);
        const vector=basin.env.get('surfaceWind',p.x,p.y,tick);
        const value=vector && Number.isFinite(vector.x) && Number.isFinite(vector.y)
            ? Math.hypot(vector.x,vector.y)*terrainFactor(terrain)*
                WindShelter.factor(basin,coord,terrain,vector.x,-vector.y) : null;
        cache.values.set(key,value);return value;
    }
    function sample(basin,profiles,coord,terrain=0,tick=basin.tick){
        const cyclone=strongest(profiles,coord,terrain);
        // Background weather is capped at 25 kt before terrain reduction. It
        // cannot change a higher storm wind or independently cross the impact
        // threshold, so destructive land-cell sampling can use strongest().
        if(cyclone.wind>=25)return {...cyclone,backgroundKnown:true};
        const background=backgroundAt(basin,coord,terrain,tick);
        return {wind:Math.max(background||0,cyclone.wind),
            source:cyclone.wind>=(background||0)?cyclone.source:null,backgroundKnown:background!==null};
    }
    function project(mapType,coord){
        const bounds=MAP_TYPES[MAP_TYPES[mapType].form==='earth'?mapType:6];
        const west=bounds.west,east=bounds.east<west?bounds.east+360:bounds.east;
        const longitude=coord.longitude+360*Math.round(((west+east)/2-coord.longitude)/360);
        return {x:(longitude-west)/(east-west)*WIDTH,
            y:(coord.latitude-bounds.north)/(bounds.south-bounds.north)*HEIGHT};
    }
    for(const key in ACTIVE_ATTRIBS)if(!ACTIVE_ATTRIBS[key].includes('windSize'))ACTIVE_ATTRIBS[key].push('windSize');
    return {sizeFor,ensure,motionBetween,recordMotion,motionFor,profile,profiles,terrainFactor,vectorAt,windAt,strongest,backgroundAt,sample,project};
})();
