// Western Pacific SST tuning and gentler Pacific shear for Normal mode.
// SST changes stay WPac-only; the shear correction covers EPac and WPac.
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

    // --- Pacific vertical wind shear climatology (0.24.1) ---
    // Start from the earlier Atlantic-calibrated seasonal factors, then reduce
    // tropical-belt shear by another 20% and ease the subtropical transition.
    // These are game-balancing parameters, not real-world shear measurements.
    const originalNormalShear = ENV_DEFS.defaults.shear.mapFunc;
    ENV_DEFS[SIM_MODE_NORMAL].shear = {
        version: 4,
        mapFunc: (u,x,y,z)=>{
            const shear = originalNormalShear(u,x,y,z);
            if(u.basin.mapType !== 7 && u.basin.mapType !== 8) return shear;

            const lat = abs(u.coord.latitude);
            const seasonalFactor = 0.8*u.piecewise(u.yearfrac(z),[
                [0.5,0.50], [1.5,0.46], [2.5,0.55], [3.5,0.40],
                [4.5,0.34], [5.5,0.42], [6.5,0.54], [7.5,0.55],
                [8.5,0.55], [9.5,0.57], [10.5,0.42], [11.5,0.51]
            ]);

            // Keep more of the relief through the subtropics, then fade it
            // out by 45 degrees so jet/trough environments remain disruptive.
            let latFactor;
            if(lat <= 3) latFactor = 0.75;
            else if(lat <= 8) latFactor = map(lat,3,8,0.75,1);
            else if(lat <= 26) latFactor = 1;
            else if(lat <= 35) latFactor = map(lat,26,35,1,0.45);
            else if(lat <= 45) latFactor = map(lat,35,45,0.45,0);
            else latFactor = 0;

            shear.mult(lerp(1,seasonalFactor,latFactor));
            return shear;
        }
    };
})();

