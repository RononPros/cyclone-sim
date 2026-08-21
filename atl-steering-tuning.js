// Atlantic steering climatology tuning for Normal mode.
// Moves the jet north to a more realistic seasonal envelope and adds a broad,
// wandering Bermuda/Azores ridge so Gulf/Caribbean and western-Atlantic flow
// are not controlled by the same nearly zonal steering everywhere.
(function(){
    const ATLANTIC_MAP_TYPE = 6;
    const originalNormalLL = ENV_DEFS.defaults.LLSteering.mapFunc;
    const originalNormalUL = ENV_DEFS.defaults.ULSteering.mapFunc;
    const originalNormalJet = ENV_DEFS.defaults.jetstream.mapFunc;

    const isAtlantic = u=>u.basin.mapType === ATLANTIC_MAP_TYPE;

    const ridgeState = (u,z)=>{
        const s = u.yearfrac(z);

        // Climatological Bermuda/Azores high: farther north/stronger in summer,
        // farther south/weaker in winter, with smooth synoptic-scale wandering.
        const baseLat = u.piecewise(s,[
            [0,28.0],
            [2,27.0],
            [4,29.0],
            [6,31.0],
            [8,32.5],
            [9.5,31.5],
            [11,29.0]
        ]);
        const strength = u.piecewise(s,[
            [0,0.80],
            [3,0.85],
            [5,1.00],
            [7,1.15],
            [9,1.10],
            [11,0.90]
        ]);

        const lon = -48
            + 7*Math.sin(TAU*z/(24*42) + 0.8)
            + 3*Math.sin(TAU*z/(24*97) + 2.1);
        const lat = baseLat
            + 1.8*Math.sin(TAU*z/(24*55) + 1.5)
            + 0.8*Math.sin(TAU*z/(24*121) + 0.2);

        return {lon,lat,strength};
    };

    const ridgeVector = (u,x,y,z,layerScale)=>{
        const ridge = ridgeState(u,z);
        const center = Coordinate.convertToXY(u.basin.mapType,ridge.lon,ridge.lat);
        const dx = x-center.x;
        const dy = y-center.y;
        const dist = Math.hypot(dx,dy);
        if(dist < 1) return {x:0,y:0};

        // The subtropical ridge is zonally elongated rather than a tiny point
        // high. This lets its circulation reach the Caribbean and Gulf while
        // remaining strongest across the central/western subtropical Atlantic.
        let dLon = u.coord.longitude-ridge.lon;
        if(dLon > 180) dLon -= 360;
        if(dLon < -180) dLon += 360;
        const dLat = u.coord.latitude-ridge.lat;
        const ellipticalDistance = Math.hypot(dLon/42,dLat/16);
        const envelope = Math.exp(-0.5*sq(ellipticalDistance));
        const mag = ridge.strength*layerScale*envelope;

        // Clockwise NH flow in screen coordinates (positive y is south).
        return {
            x: -dy/dist*mag,
            y:  dx/dist*mag
        };
    };

    // --- Jet stream ---
    ENV_DEFS[SIM_MODE_NORMAL].jetstream = {
        version: 1,
        mapFunc: (u,x,y,z)=>{
            if(!isAtlantic(u)) return originalNormalJet(u,x,y,z);

            const s = u.yearfrac(z);
            const centerLat = u.piecewise(s,[
                [0,41.0],
                [2,42.0],
                [4,45.0],
                [6,49.0],
                [8,50.0],
                [9.5,48.0],
                [11,43.0]
            ]);
            const meanderRange = u.piecewise(s,[
                [0,10.0],
                [2,10.0],
                [4,9.0],
                [6,8.0],
                [8,7.5],
                [10,8.5],
                [11.5,9.5]
            ]);

            let wave = u.noise(0,x-z*3,0,z);
            wave = map(wave,0,1,-meanderRange,meanderRange);
            const jetLat = constrain(centerLat+wave,27,58.5);
            return Coordinate.convertToXY(u.basin.mapType,u.coord.longitude,jetLat).y;
        }
    };

    // --- Low-level steering ---
    ENV_DEFS[SIM_MODE_NORMAL].LLSteering = {
        version: 1,
        mapFunc: (u,x,y,z)=>{
            if(!isAtlantic(u)) return originalNormalLL(u,x,y,z);

            u.vec.set(1);

            const j = u.field('jetstream');
            const h = map(cos(map(y,0,HEIGHT,0,PI)),-1,1,1,0);

            const west = constrain(pow(
                1-h
                + map(u.noise(0),0,1,-u.modifiers.westerlyNoiseRange,u.modifiers.westerlyNoiseRange)
                + map(j,0,HEIGHT,-u.modifiers.westerlyJetstreamEffectRange,u.modifiers.westerlyJetstreamEffectRange),
                2
            )*4,0,u.modifiers.westerlyMax);

            const ridging = constrain(
                u.noise(1)
                + map(j,0,HEIGHT,u.modifiers.ridgingJetstreamEffectRange,-u.modifiers.ridgingJetstreamEffectRange),
                0,1
            );
            const trades = constrain(pow(
                h + map(ridging,0,1,-u.modifiers.tradesRidgingEffectRange,u.modifiers.tradesRidgingEffectRange),
                2
            )*3,0,u.modifiers.tradesMax);

            // Stock code extrapolates this tiny 0.9-1.0 control range through
            // most of the tropics. Clamp it so the intended trade-wind bounds
            // are respected instead of producing accidental out-of-range angles.
            const tAngle = map(
                h,0.9,1,
                u.modifiers.tradesAngle,
                u.modifiers.tradesAngleEquator,
                true
            );

            const a = map(u.noise(3),0,1,0,4*TAU);
            const m = pow(
                u.modifiers.noiseBase,
                map(u.noise(2),0,1,u.modifiers.noiseExponentMin,u.modifiers.noiseExponentMax)
            );

            u.vec.rotate(a);
            u.vec.mult(m);
            u.vec.add(west+trades*cos(tAngle),trades*sin(tAngle));

            const ridge = ridgeVector(u,x,y,z,1.10);
            u.vec.add(ridge.x,ridge.y);
            return u.vec;
        }
    };

    // --- Upper-level steering ---
    // The tuned jet already changes the large-scale UL flow. Add a weaker copy
    // of the same subtropical ridge so deep hurricanes still feel the western
    // ridge edge instead of instantly forgetting it as depth increases.
    ENV_DEFS[SIM_MODE_NORMAL].ULSteering = {
        version: 1,
        mapFunc: (u,x,y,z)=>{
            const base = originalNormalUL(u,x,y,z);
            if(!isAtlantic(u)) return base;

            const ridge = ridgeVector(u,x,y,z,0.75);
            base.add(ridge.x,ridge.y);
            return base;
        }
    };
})();
