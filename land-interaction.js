// Raptor Mod 0.18.0: land exposure across a cyclone's surrounding circulation.
// Sampling radii are game-model parameters, not diagnosed wind radii. Distances
// are spherical kilometres on Earth maps and the same virtual scale elsewhere.
const LandInteraction = (function(){
    const EARTH_RADIUS_KM = 6371;
    const DEG = Math.PI/180;
    const RESPONSE = 1-Math.exp(-1/3); // three simulated hours to adjust
    const CONTACT_THRESHOLD = 0.01;
    const BANDS = [
        {inner:0,outer:50,weight:0.60},
        {inner:50,outer:100,weight:0.30},
        {inner:100,outer:200,weight:0.10}
    ];
    const cache = new WeakMap();
    const lastAdvanced = new WeakMap();
    const clamp = v=>Math.max(0,Math.min(1,Number(v)||0));

    // A tiny central disk keeps small islands detectable, with only their small
    // share of the inner area's weight. The rest is equal-area annular sampling.
    const points = BANDS.map((band,index)=>{
        const list = [];
        const inner = index===0 ? 10 : band.inner;
        const centerShare = index===0 ? 0.04 : 0;
        if(centerShare) list.push({cosDistance:1,sinDistance:0,sinBearing:0,cosBearing:1,weight:centerShare});
        for(let radial=0;radial<3;radial++){
            const radius = Math.sqrt(inner*inner+(radial+0.5)/3*(band.outer*band.outer-inner*inner));
            const angle = radius/EARTH_RADIUS_KM;
            for(let sector=0;sector<16;sector++){
                const bearing = (sector+0.25+(radial%2)*0.5)*2*Math.PI/16;
                list.push({
                    cosDistance:Math.cos(angle),sinDistance:Math.sin(angle),
                    sinBearing:Math.sin(bearing),cosBearing:Math.cos(bearing),
                    weight:(1-centerShare)/48
                });
            }
        }
        return list;
    });

    const insideSyntheticMap = (coord,mapType)=>{
        const bounds = MAP_TYPES[mapType].form==='earth' ? MAP_TYPES[mapType] : MAP_TYPES[6];
        let longitude = coord.longitude;
        let east = bounds.east;
        if(east<bounds.west){
            east += 360;
            if(longitude<bounds.west) longitude += 360;
        }
        return longitude>=bounds.west && longitude<=east &&
            coord.latitude>=bounds.south && coord.latitude<=bounds.north;
    };

    const sample = sys=>{
        const previous = cache.get(sys);
        const basin = sys.basin;
        if(previous && previous.land===land && previous.basin===basin &&
           previous.tick===basin.tick && previous.x===sys.pos.x && previous.y===sys.pos.y)
            return previous.sample;

        const center = sys.coord();
        const latitude = center.latitude*DEG;
        const longitude = center.longitude*DEG;
        const sinLat = Math.sin(latitude);
        const cosLat = Math.cos(latitude);
        const earth = MAP_TYPES[basin.mapType].form==='earth';
        let weightedCoverage = 0;
        let weightedTerrain = 0;
        const coverage = points.map((bandPoints,index)=>{
            let known = 0;
            let covered = 0;
            let terrain = 0;
            for(const point of bandPoints){
                const lat = Math.asin(Math.max(-1,Math.min(1,
                    sinLat*point.cosDistance+cosLat*point.sinDistance*point.cosBearing)));
                const lon = longitude+Math.atan2(
                    point.sinBearing*point.sinDistance*cosLat,
                    point.cosDistance-sinLat*Math.sin(lat)
                );
                const coord = new Coordinate(lon/DEG,lat/DEG);
                // Synthetic land.get() clamps out-of-sector coordinates. Exclude
                // those unknown samples instead of repeating an edge's terrain.
                if(!earth && !insideSyntheticMap(coord,basin.mapType)) continue;
                const value = land.get(coord);
                known += point.weight;
                if(value){
                    covered += point.weight;
                    terrain += point.weight*clamp((value-0.5)/0.5);
                }
            }
            const fraction = known ? clamp(covered/known) : 0;
            weightedCoverage += fraction*BANDS[index].weight;
            weightedTerrain += (known ? terrain/known : 0)*BANDS[index].weight;
            return fraction;
        });
        const result = {coverage:clamp(weightedCoverage),bands:coverage,terrain:clamp(weightedTerrain)};
        cache.set(sys,{land,basin,tick:basin.tick,x:sys.pos.x,y:sys.pos.y,sample:result});
        return result;
    };

    const read = sys=>{
        const footprint = sample(sys);
        const influence = sys.landInteractionInitialized ? clamp(sys.landInfluence) : footprint.coverage;
        return {
            coverage:footprint.coverage,
            bands:footprint.bands,
            terrain:footprint.terrain,
            influence,
            // Mild overlap has a modest effect; extensive inland exposure removes
            // ocean support completely. This is not a direct wind-speed penalty.
            oceanSupport:1-Math.pow(influence,1.5),
            exposureHours:Math.max(0,Number(sys.landExposureHours)||0)
        };
    };

    const advance = sys=>{
        if(lastAdvanced.get(sys)===sys.basin.tick) return read(sys);
        const footprint = sample(sys);
        if(!sys.landInteractionInitialized){
            // New systems and pre-0.18 saves start from the actual footprint.
            sys.landInfluence = footprint.coverage;
            sys.landInteractionInitialized = 1;
        }else{
            const before = clamp(sys.landInfluence);
            sys.landInfluence = clamp(before+(footprint.coverage-before)*RESPONSE);
            if(footprint.coverage===0 && sys.landInfluence<0.0001) sys.landInfluence = 0;
        }
        sys.landExposureHours = footprint.coverage>=CONTACT_THRESHOLD ?
            Math.max(0,Number(sys.landExposureHours)||0)+1 : 0;
        lastAdvanced.set(sys,sys.basin.tick);
        return read(sys);
    };

    const pressurePotential = (SST,exposure,capWarmSST)=>{
        const ratio = SST<25 ? 1 : map(SST,25,30,1,2,!!capWarmSST);
        const ocean = 1010-25*Math.log(ratio)/Math.log(1.17);
        return lerp(1010,ocean,exposure.oceanSupport);
    };

    // Register through the existing active-state serializer. Older saves have
    // zero/absent entries and initialize on their next simulated hour.
    for(const key in ACTIVE_ATTRIBS){
        for(const attribute of ['landInfluence','landExposureHours','landInteractionInitialized']){
            if(!ACTIVE_ATTRIBS[key].includes(attribute)) ACTIVE_ATTRIBS[key].push(attribute);
        }
    }

    return {
        sample,read,advance,pressurePotential,
        organizationLoss:exposure=>0.018*(exposure.influence+0.5*exposure.terrain),
        bands:BANDS,
        maxInfluence:{veryFavorable:0.20,exceptionalRI:0.10,eliteRI:0.05}
    };
})();
window.__raptorLandInteraction = LandInteraction;
