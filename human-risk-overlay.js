// Raptor Mod 0.10.0: dynamic human-risk heatmap.
// Uses the simulator's existing land/exposure proxy plus active-cyclone hazard.
// No external population dataset is used in this first version.
(function(){
    // Settings are stored positionally. New settings belong at the beginning so
    // older saved arrays still line up correctly when values are popped from end.
    const baseSettingsOrder = Settings.order;
    const baseSettingsDefaults = Settings.defaults;
    Settings.order = function(){
        const order = baseSettingsOrder.call(Settings);
        return order.includes('humanRiskOverlay') ? order : ['humanRiskOverlay', ...order];
    };
    Settings.defaults = function(){
        const defaults = baseSettingsDefaults.call(Settings);
        return [false, ...defaults];
    };

    const originalUIInit = UI.init;

    UI.init = function(){
        originalUIInit.call(UI);

        const CELL = 10;
        const UPDATE_HOURS = 3;
        const MIN_RISK = 0.025;
        const riskBuffer = createBuffer(WIDTH,HEIGHT);
        riskBuffer.noStroke();

        let exposureCells = [];
        let cachedBasin;
        let cachedLand;
        let lastRiskTick = -Infinity;
        let lastPausedSignature = '';
        let wasEnabled = false;
        let lastMaxRisk = 0;

        const mix = (a,b,t)=>a+(b-a)*t;

        const riskColor = r=>{
            let a;
            let b;
            let t;
            if(r < 0.18){
                a = [255,226,70];
                b = [255,158,45];
                t = map(r,MIN_RISK,0.18,0,1,true);
            }else if(r < 0.42){
                a = [255,158,45];
                b = [240,55,45];
                t = map(r,0.18,0.42,0,1,true);
            }else if(r < 0.70){
                a = [240,55,45];
                b = [205,35,105];
                t = map(r,0.42,0.70,0,1,true);
            }else{
                a = [205,35,105];
                b = [170,45,220];
                t = map(r,0.70,1,0,1,true);
            }
            const alpha = map(r,MIN_RISK,1,42,178,true);
            return [
                mix(a[0],b[0],t),
                mix(a[1],b[1],t),
                mix(a[2],b[2],t),
                alpha
            ];
        };

        const buildExposureGrid = basin=>{
            exposureCells = [];
            cachedBasin = basin;
            cachedLand = land;

            // This deliberately mirrors the population/exposure shape already
            // used by the stock damage system: low-elevation tropical/coastal
            // land receives more exposure than high terrain and poleward land.
            for(let y=CELL/2;y<HEIGHT;y+=CELL){
                for(let x=CELL/2;x<WIDTH;x+=CELL){
                    const coord = Coordinate.convertFromXY(basin.mapType,x,y);
                    const lnd = land.get(coord);
                    if(!lnd) continue;

                    const elevationFactor = pow(0.8,map(lnd,0.5,1,0,30,true));
                    const latitudeFactor = (1 + basin.hemY(y)/HEIGHT) / 2;
                    const exposure = constrain(elevationFactor*latitudeFactor,0,1);
                    if(exposure < 0.002) continue;

                    exposureCells.push({x,y,exposure});
                }
            }
        };

        const activeSignature = basin=>{
            return basin.activeSystems.map(sys=>[
                round(sys.pos.x),
                round(sys.pos.y),
                round(sys.windSpeed),
                round(sys.pressure),
                sys.type
            ].join(':')).join('|');
        };

        const updateRisk = basin=>{
            if(cachedBasin!==basin || cachedLand!==land || exposureCells.length===0)
                buildExposureGrid(basin);

            riskBuffer.clear();
            riskBuffer.noStroke();
            lastMaxRisk = 0;

            const hazards = [];
            for(const sys of basin.activeSystems){
                const wind = Number(sys.windSpeed) || 0;
                if(wind < 20) continue;

                const windFactor = map(wind,20,160,0,1,true);
                const pressureFactor = map(sys.pressure,1018,900,0,1,true);
                let intensity = 0.78*windFactor + 0.22*pressureFactor;
                if(intensity <= 0) continue;

                let typeFactor = 1;
                if(sys.type===TROPWAVE) typeFactor = 0.55;
                else if(sys.type===EXTROP) typeFactor = 0.72;
                else if(sys.type===SUBTROP) typeFactor = 0.88;

                intensity *= typeFactor;
                const radius = 32 + 118*sqrt(constrain(intensity,0,1));
                hazards.push({
                    x: sys.pos.x,
                    y: sys.pos.y,
                    intensity: constrain(intensity,0,1),
                    radius
                });
            }

            if(hazards.length===0){
                lastRiskTick = basin.tick;
                lastPausedSignature = activeSignature(basin);
                return;
            }

            for(const cell of exposureCells){
                let survival = 1;

                for(const h of hazards){
                    const dx = cell.x-h.x;
                    const dy = cell.y-h.y;
                    const distance = sqrt(dx*dx+dy*dy);
                    if(distance >= h.radius) continue;

                    const d = distance/h.radius;
                    // Keep the inner core dangerous, then taper smoothly through
                    // the broader storm influence region.
                    let distanceFactor;
                    if(d <= 0.16) distanceFactor = 1;
                    else distanceFactor = pow(1-map(d,0.16,1,0,1,true),1.65);

                    const localHazard = constrain(h.intensity*distanceFactor,0,0.97);
                    survival *= (1-localHazard);
                }

                const combinedHazard = 1-survival;
                if(combinedHazard<=0) continue;

                // Exposure changes where the hazard matters to people without
                // allowing sparse/high terrain to completely disappear.
                const risk = constrain(combinedHazard*pow(cell.exposure,0.62),0,1);
                if(risk < MIN_RISK) continue;

                lastMaxRisk = max(lastMaxRisk,risk);
                const c = riskColor(risk);
                riskBuffer.fill(c[0],c[1],c[2],c[3]);
                riskBuffer.rect(cell.x-CELL/2,cell.y-CELL/2,CELL+1,CELL+1);
            }

            lastRiskTick = basin.tick;
            lastPausedSignature = activeSignature(basin);
        };

        // Fit the new toggle into the existing one-column Settings menu. Ten
        // options at the old 37px spacing collide with Back, so compact only this
        // settings chain to 34px. No other menu layout is touched.
        const firstSetting = settingsMenu.children.find(u=>
            u.width===300 && u.height===30 &&
            u.relX===WIDTH/2-150 && u.relY < HEIGHT/2 &&
            u.clickFunc instanceof Function
        );

        if(firstSetting){
            const chain = [];
            let current = firstSetting;
            while(current){
                chain.push(current);
                current = (current.children || []).find(c=>
                    c.width===300 && c.height===30 && c.relX===0 &&
                    c.clickFunc instanceof Function
                );
            }

            for(let i=1;i<chain.length;i++) chain[i].relY = 34;

            const last = chain[chain.length-1];
            last.append(false,0,34,300,30,function(s){
                const b = simSettings.humanRiskOverlay ? 'Enabled' : 'Disabled';
                s.button('Human Risk Overlay: '+b,true,17);
            },function(){
                simSettings.setHumanRiskOverlay('toggle');
                lastRiskTick = -Infinity;
                wasEnabled = !!simSettings.humanRiskOverlay;
                if(!simSettings.humanRiskOverlay) riskBuffer.clear();
            });
        }else{
            console.warn('Raptor human-risk overlay: Settings chain not found');
        }

        const originalPrimaryRender = primaryWrapper.renderFunc;
        primaryWrapper.renderFunc = function(s){
            originalPrimaryRender.call(this,s);

            const basin = UI.viewBasin;
            const enabled = !!(simSettings && simSettings.humanRiskOverlay);
            if(!enabled || !(basin instanceof Basin) || !land || !land.drawn || !basin.viewingPresent()){
                wasEnabled = enabled;
                return;
            }

            const pausedSignature = activeSignature(basin);
            const sameTickChanged = basin.tick===lastRiskTick && pausedSignature!==lastPausedSignature;
            if(!wasEnabled || cachedBasin!==basin || cachedLand!==land ||
                basin.tick-lastRiskTick>=UPDATE_HOURS || sameTickChanged)
                updateRisk(basin);

            wasEnabled = true;

            // Draw risk above environmental/land layers. Redraw storm tracks and
            // icons afterward so the heatmap never buries the meteorology itself.
            drawBuffer(riskBuffer);
            drawBuffer(tracks);
            drawBuffer(forecastTracks);
            drawBuffer(stormIcons);

            // Compact legend. The overlay is current-risk only, so it appears only
            // while viewing the live simulation rather than historical analysis.
            push();
            const lx = 8;
            const ly = HEIGHT-25;
            fill(0,0,0,145);
            noStroke();
            rect(lx-4,ly-3,244,21,4);
            fill(255);
            textAlign(LEFT,CENTER);
            textStyle(BOLD);
            textSize(10);
            text('HUMAN RISK',lx,ly+7);
            textStyle(NORMAL);
            const legend = [
                [[255,226,70],'LOW'],
                [[255,158,45],'MOD'],
                [[240,55,45],'HIGH'],
                [[170,45,220],'EXTREME']
            ];
            let x = lx+67;
            for(const item of legend){
                fill(item[0][0],item[0][1],item[0][2],210);
                rect(x,ly+2,9,9,2);
                fill(255);
                text(item[1],x+12,ly+7);
                x += item[1]==='EXTREME' ? 0 : 42;
            }
            pop();
        };

        window.__raptorHumanRiskOverlay = {
            buffer: riskBuffer,
            rebuild: ()=>{
                lastRiskTick = -Infinity;
                if(UI.viewBasin instanceof Basin && land && land.drawn)
                    updateRisk(UI.viewBasin);
            },
            get maxRisk(){ return lastMaxRisk; }
        };
    };
})();
