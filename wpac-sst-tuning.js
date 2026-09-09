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
    // Stock shear is simply the difference between the procedural upper- and
    // lower-level steering vectors. In the WPac this routinely produces a basin-
    // wide hostile background even during peak typhoon season. Keep the vector
    // direction and all procedural pockets, but apply a stronger climatological
    // magnitude correction across the tropical development belt.
    const originalNormalShear = ENV_DEFS.defaults.shear.mapFunc;
    ENV_DEFS[SIM_MODE_NORMAL].shear = {
        version: 2,
        mapFunc: (u,x,y,z)=>{
            const shear = originalNormalShear(u,x,y,z);
            if(u.basin.mapType !== 8) return shear;

            const lat = abs(u.coord.latitude);
            let lon = u.coord.longitude;
            if(lon < 0) lon += 360;

            // Target multiplier in the core typhoon belt. The WPac remains more
            // hostile in winter, but even winter no longer receives an artificial
            // shear increase. June-September gets a broad low-shear monsoon-trough
            // / warm-pool window rather than only a token 10-20% reduction.
            const seasonalFactor = u.piecewise(u.yearfrac(z),[
                [0, 0.78],
                [1, 0.76],
                [2, 0.72],
                [3, 0.68],
                [4, 0.62],
                [5, 0.58],
                [6, 0.55],
                [7, 0.55],
                [8, 0.57],
                [9, 0.62],
                [10,0.70],
                [11,0.75],
                [12,0.78]
            ]);

            // Strongest across the main 8-24 N development corridor. Deep-
            // tropical systems still benefit substantially, while the correction
            // fades quickly north of ~30-35 N so the subtropical jet and troughs
            // can still create genuinely hostile recurvature environments.
            let latFactor;
            if(lat <= 3) latFactor = 0.75;
            else if(lat <= 8) latFactor = map(lat,3,8,0.75,0.95);
            else if(lat <= 24) latFactor = 1.0;
            else if(lat <= 30) latFactor = map(lat,24,30,1.0,0.85);
            else if(lat <= 35) latFactor = map(lat,30,35,0.85,0.50);
            else if(lat <= 42) latFactor = map(lat,35,42,0.50,0.15);
            else latFactor = 0;

            // Favor the western warm pool and Philippine Sea, tapering gradually
            // toward the dateline/eastern edge without creating a hard boundary.
            let lonFactor;
            if(lon < 105) lonFactor = 0.75;
            else if(lon <= 125) lonFactor = map(lon,105,125,0.75,1.0,true);
            else if(lon <= 165) lonFactor = 1.0;
            else if(lon <= 180) lonFactor = map(lon,165,180,1.0,0.90,true);
            else if(lon <= 205) lonFactor = map(lon,180,205,0.90,0.70,true);
            else lonFactor = 0.65;

            const influence = constrain(latFactor*lonFactor,0,1);
            let factor = lerp(1,seasonalFactor,influence);
            factor = constrain(factor,0.55,1.0);

            // Magnitude only. This does not alter the LL/UL steering vectors,
            // storm motion, shear direction, or the location of procedural
            // trough/jet pockets; it only fixes the excessive background magnitude.
            shear.mult(factor);
            return shear;
        }
    };
})();
