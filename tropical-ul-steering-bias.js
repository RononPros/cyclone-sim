// Strengthen westward upper-level steering in the deep tropics while
// preserving the existing jetstream/trough/ridge structure.
//
// The simulator's map coordinates increase eastward, so a negative x
// component represents westward steering.
(function(){
    const biasForLatitude = lat => {
        lat = Math.abs(lat);
        const points = [
            [0, 3.3],
            [5, 2.9],
            [10, 2.3],
            [15, 1.6],
            [20, 0.9],
            [25, 0.4],
            [30, 0]
        ];

        if(lat >= 30) return 0;
        for(let i = 1; i < points.length; i++){
            const [lat1, bias1] = points[i];
            if(lat <= lat1){
                const [lat0, bias0] = points[i - 1];
                return map(lat, lat0, lat1, bias0, bias1);
            }
        }
        return 0;
    };

    const wrapULSteering = def => {
        if(!def || !(def.mapFunc instanceof Function)) return;
        const originalMapFunc = def.mapFunc;

        def.mapFunc = function(u, x, y, z){
            const v = originalMapFunc(u, x, y, z);

            // Latitude-based easterly bias: strongest near the equator,
            // fading to zero by 30 degrees latitude.
            let westwardBias = biasForLatitude(u.coord.latitude);

            // Fade the added bias out near the jetstream so mid-latitude
            // troughs and recurvature remain dominated by the original flow.
            const jetY = u.field('jetstream');
            const jetDistance = Math.abs(y - jetY);
            const jetFade = map(jetDistance, 0, 100, 0, 1, true);
            westwardBias *= jetFade;

            v.x -= westwardBias;
            return v;
        };
    };

    // Most modes inherit the default UL steering map function.
    wrapULSteering(ENV_DEFS.defaults.ULSteering);

    // Wild mode defines its own UL steering map function, so wrap it too.
    wrapULSteering(ENV_DEFS[SIM_MODE_WILD] && ENV_DEFS[SIM_MODE_WILD].ULSteering);
})();
