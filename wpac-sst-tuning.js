// Western Pacific SST tuning for Normal mode.
// Keeps the base simulator climatology intact everywhere else while making
// the WPac warm pool and late-summer poleward warm tongue more realistic.
(function(){
    const originalNormalAnomaly = ENV_DEFS.defaults.SSTAnomaly.mapFunc;
    ENV_DEFS[SIM_MODE_NORMAL].SSTAnomaly = {
        version: 1,
        mapFunc: (u,x,y,z)=>{
            let v = originalNormalAnomaly(u,x,y,z);
            // The default anomaly field is very aggressive for the WPac.
            // Preserve variability, but reduce the amplitude by 30% there.
            if(u.basin.mapType === 8) v *= 0.7;
            return v;
        }
    };

    const originalNormalSST = ENV_DEFS.defaults.SST.mapFunc;
    ENV_DEFS[SIM_MODE_NORMAL].SST = {
        version: 1,
        mapFunc: (u,x,y,z)=>{
            let t = originalNormalSST(u,x,y,z);
            if(y < 0 || u.basin.mapType !== 8) return t;

            const lat = abs(u.coord.latitude);
            if(lat >= 50) return t;

            // Persistent warm-pool correction in the deep tropics.
            // +0.5 C through 20 N, fading out by 30 N.
            let tropicalBias = lat <= 20 ? 0.5 : map(lat,20,30,0.5,0,true);

            // Kuroshio / western-boundary-current warm tongue.
            // At peak season this adds roughly:
            // 20 N: +0.0 C, 25 N: +0.75 C, 30-35 N: +1.5 C,
            // 40 N: +1.0 C, 45 N: +0.5 C, 50 N: +0.0 C.
            let warmTongue;
            if(lat <= 20) warmTongue = 0;
            else if(lat <= 30) warmTongue = map(lat,20,30,0,1.5);
            else if(lat <= 35) warmTongue = 1.5;
            else warmTongue = map(lat,35,50,1.5,0,true);

            // Broad warm season with an August-September plateau, then a
            // gradual autumn fade instead of an abrupt seasonal cliff.
            const warmSeason = u.piecewise(u.yearfrac(z),[
                [0,0.20],
                [2,0.12],
                [4,0.30],
                [5,0.60],
                [6,0.85],
                [7,1.00],
                [8.5,1.00],
                [9.5,0.85],
                [10.5,0.50],
                [11.5,0.25]
            ]);

            // Strongest in the western warm pool; taper eastward toward the
            // central Pacific so the whole basin does not get the same boost.
            let lon = u.coord.longitude;
            if(lon < 0) lon += 360;
            const lonFactor = lon <= 160 ? 1 : map(lon,160,200,1,0.35,true);

            return t + (tropicalBias + warmTongue*warmSeason)*lonFactor;
        }
    };
})();
