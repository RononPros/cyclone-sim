// Western Pacific environment tuning for Normal mode.
// Keeps the base simulator climatology intact everywhere else while making
// WPac SSTs and vertical-wind-shear seasonality more realistic.
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

    // --- Vertical wind shear climatology ---
    // The stock model already moves the jet stream equatorward in winter and
    // poleward in summer. This correction is intentionally moderate: it keeps
    // that existing physics, but makes the tropical WPac seasonal envelope more
    // realistic without changing LL/UL steering or storm tracks.
    const originalNormalShear = ENV_DEFS.defaults.shear.mapFunc;
    ENV_DEFS[SIM_MODE_NORMAL].shear = {
        version: 1,
        mapFunc: (u,x,y,z)=>{
            const shear = originalNormalShear(u,x,y,z);
            if(u.basin.mapType !== 8) return shear;

            const lat = abs(u.coord.latitude);
            let lon = u.coord.longitude;
            if(lon < 0) lon += 360;

            // Winter is somewhat more hostile; summer and early autumn favor a
            // broader low-shear typhoon-development belt. Values are fractional
            // corrections applied to the stock shear magnitude.
            const seasonalCorrection = u.piecewise(u.yearfrac(z),[
                [0, 0.10],
                [1, 0.12],
                [2, 0.10],
                [3, 0.03],
                [4,-0.06],
                [5,-0.13],
                [6,-0.18],
                [7,-0.20],
                [8,-0.18],
                [9,-0.12],
                [10,-0.02],
                [11, 0.06],
                [12, 0.10]
            ]);

            // Main modulation across roughly 10-25 N. The deep tropics retain
            // winter low-shear escape routes, while the correction fades north
            // of the typhoon belt where the explicit jet should dominate.
            let latFactor;
            if(lat <= 7) latFactor = 0.35;
            else if(lat <= 12) latFactor = map(lat,7,12,0.35,0.85);
            else if(lat <= 25) latFactor = 1.0;
            else if(lat <= 32) latFactor = map(lat,25,32,1.0,0.55);
            else if(lat <= 40) latFactor = map(lat,32,40,0.55,0.15);
            else latFactor = 0.10;

            // Strongest on the western warm-pool / Philippine Sea side, then
            // gradually weaker toward the dateline and eastern map edge.
            let shearLonFactor;
            if(lon < 110) shearLonFactor = 0.85;
            else if(lon <= 160) shearLonFactor = 1.0;
            else if(lon <= 180) shearLonFactor = map(lon,160,180,1.0,0.85,true);
            else shearLonFactor = map(lon,180,205,0.85,0.65,true);

            let factor = 1 + seasonalCorrection*latFactor*shearLonFactor;
            factor = constrain(factor,0.78,1.15);

            // Magnitude only: preserve the direction and all of the stock
            // procedural variability / trough-like shear pockets.
            shear.mult(factor);
            return shear;
        }
    };
})();
