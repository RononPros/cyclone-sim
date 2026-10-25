// Ordinary surface weather, in one-minute sustained knots. Steering supplies
// direction only: its map-units/hour magnitude is not a surface wind speed.
(function(){
    ENV_DEFS.defaults.surfaceWind={
        displayName:'Background wind (open terrain)',version:1,vector:true,noVectorFlip:true,
        magMap:[0,25,0,20],
        noiseChannels:[[4,0.5,180,700,0.35,0.8],[3,0.5,380,1600,0.12,0.5]],
        modifiers:{strength:1},
        mapFunc:(u,x,y,z)=>{
            const local=u.noise(0),broad=u.noise(1);
            const latitude=Math.min(1,Math.abs(u.coord.latitude)/55);
            const winter=(1+Math.cos(2*Math.PI*z/YEAR_LENGTH))/2;
            const bounds=MAP_TYPES[MAP_TYPES[u.basin.mapType].form==='earth'?u.basin.mapType:6];
            const jetDistance=Math.abs(y-u.field('jetstream'))/HEIGHT*Math.abs(bounds.north-bounds.south)*111.195;
            // A broad, weather-dependent climatology bump around the jet belt.
            // This is not direct downward transfer of jet-level wind speed.
            const jetBoost=6*Math.exp(-0.5*(jetDistance/500)**2)*(0.35+0.65*broad);
            const speed=Math.min(25,Math.max(1.5,(3+13*local+5*broad+4*latitude*winter+jetBoost)*u.modifiers.strength));
            const steering=u.field('LLSteering');
            const angle=steering.heading()+(broad-0.5)*Math.PI/3;
            u.vec.set(Math.cos(angle)*speed,Math.sin(angle)*speed);
            return u.vec;
        },
        displayFormat:v=>displayWindspeed(Math.round(v.mag()*10)/10,1)
    };
    for(let mode=0;mode<SIMULATION_MODES.length;mode++)
        ENV_DEFS[mode].surfaceWind={modifiers:{strength:mode===SIM_MODE_CALM?0.85:1}};
})();
