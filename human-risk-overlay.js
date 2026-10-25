// Human Risk heatmap: 0.20.0 uses the shared local-wind footprint.
// Risk retains the terrain/latitude exposure proxy; actual impact accounting
// runs separately once per simulated hour through WindImpacts.
(function(){
    const BUILD = '0.10.1';
    const BUILD_DATE = '21 Aug 2026';

    window.RAPTOR_MOD_BUILD = BUILD;
    const EXTRA_RELEASES = [
        {
            build: '0.10.1',
            date: '21 Aug 2026',
            changes: [
                'Moved the Human Risk legend higher so it no longer sits awkwardly on top of the bottom UI bar.',
                'Increased Human Risk overlay visibility, especially for lower-risk cells, by using stronger opacity.',
                'Added hover feedback for active Human Risk cells, including a highlighted grid cell and a tooltip with the current risk category and Risk Index /100.'
            ]
        },
        {
            build: '0.10.0',
            date: '21 Aug 2026',
            changes: [
                'Added a toggleable Human Risk Overlay to Settings.',
                'Current risk combines the existing land/exposure proxy with active-cyclone wind, pressure, distance, and cyclone type.',
                'Risk is displayed only over exposed land using Low / Moderate / High / Extreme heatmap colors.',
                'The heatmap refreshes every three simulated hours and also reacts immediately to paused storm spawning/deletion.',
                'Storm tracks, forecast tracks, and icons are redrawn above the risk layer so meteorological information stays readable.',
                'This first version uses the simulator exposure proxy rather than an external real-world population dataset.'
            ]
        }
    ];
    if(Array.isArray(window.RAPTOR_MOD_CHANGELOG)){
        for(let i=EXTRA_RELEASES.length-1;i>=0;i--){
            const release = EXTRA_RELEASES[i];
            if(!window.RAPTOR_MOD_CHANGELOG.some(r=>r.build===release.build))
                window.RAPTOR_MOD_CHANGELOG.unshift(release);
        }
    }

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

        const mainBuildMarker = mainMenu.children.find(u=>
            u.renderFunc && u.renderFunc.toString().includes('Raptor Mod build')
        );
        if(mainBuildMarker){
            mainBuildMarker.renderFunc = function(){
                fill(COLORS.UI.text);
                noStroke();
                textAlign(CENTER,CENTER);
                textStyle(NORMAL);
                textSize(14);
                text('Raptor Mod build ' + BUILD + '  |  Base v' + VERSION_NUMBER,0,0);
            };
        }

        const walk = (node,pred)=>{
            if(pred(node)) return node;
            for(const child of node.children || []){
                const found = walk(child,pred);
                if(found) return found;
            }
        };
        let changelogHeader;
        for(const root of UI.elements){
            changelogHeader = walk(root,u=>
                u.renderFunc && u.renderFunc.toString().includes('Raptor Mod Changelog')
            );
            if(changelogHeader) break;
        }
        if(changelogHeader){
            changelogHeader.renderFunc = function(){
                fill(COLORS.UI.text);
                noStroke();
                textAlign(CENTER,CENTER);
                textStyle(NORMAL);
                textSize(34);
                text('Raptor Mod Changelog',0,0);
                textSize(15);
                text('Current build: ' + BUILD + '  |  ' + BUILD_DATE + '  |  Base v' + VERSION_NUMBER,0,34);
                textSize(12);
                text('Mouse wheel to scroll',0,56);
            };
        }

        const CELL = CityLocations.CELL;
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
        let riskCells = Object.create(null);

        const mix = (a,b,t)=>a+(b-a)*t;
        const riskKey = (gx,gy)=>gx + ',' + gy;

        const riskBand = r=>{
            if(r < 0.18) return {label: 'Low', color: [255,226,70]};
            if(r < 0.42) return {label: 'Moderate', color: [255,158,45]};
            if(r < 0.70) return {label: 'High', color: [240,55,45]};
            return {label: 'Extreme', color: [170,45,220]};
        };

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
            const alpha = map(r,MIN_RISK,1,82,196,true);
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

            exposureCells = CityLocations.context(basin).cells;

        };

        const activeSignature = basin=>{
            return basin.activeSystems.map(sys=>[
                round(sys.pos.x),
                round(sys.pos.y),
                round(sys.windSpeed),
                round(sys.pressure),
                sys.windSize,
                sys.type
            ].join(':')).join('|');
        };

        const updateRisk = basin=>{
            if(cachedBasin!==basin || cachedLand!==land || exposureCells.length===0)
                buildExposureGrid(basin);

            riskBuffer.clear();
            riskBuffer.noStroke();
            lastMaxRisk = 0;
            riskCells = Object.create(null);

            const profiles = WindField.profiles(basin);

            for(const cell of exposureCells){
                const wind = WindField.strongest(profiles,cell.coord,cell.terrain).wind;
                const hazard = constrain((wind-25)/130,0,1);
                const risk = constrain(pow(hazard,1.3)*pow(cell.exposure,0.62),0,1);
                if(risk < MIN_RISK) continue;

                lastMaxRisk = max(lastMaxRisk,risk);
                const c = riskColor(risk);
                const gx = floor(cell.x/CELL);
                const gy = floor(cell.y/CELL);
                riskCells[riskKey(gx,gy)] = {
                    risk,
                    band: riskBand(risk),
                    x: gx*CELL,
                    y: gy*CELL
                };
                riskBuffer.fill(c[0],c[1],c[2],c[3]);
                riskBuffer.rect(cell.x-CELL/2,cell.y-CELL/2,CELL+1,CELL+1);
            }

            lastRiskTick = basin.tick;
            lastPausedSignature = activeSignature(basin);
        };

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
                if(!simSettings.humanRiskOverlay){
                    riskBuffer.clear();
                    riskCells = Object.create(null);
                }
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

            drawBuffer(riskBuffer);
            drawBuffer(tracks);
            drawBuffer(forecastTracks);
            drawBuffer(stormIcons);

            push();
            const lx = 8;
            const ly = HEIGHT-46;
            fill(0,0,0,165);
            noStroke();
            rect(lx-4,ly-4,244,22,4);
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
                fill(item[0][0],item[0][1],item[0][2],225);
                rect(x,ly+2,9,9,2);
                fill(255);
                text(item[1],x+12,ly+7);
                x += item[1]==='EXTREME' ? 0 : 42;
            }
            pop();

            const mx = getMouseX();
            const my = getMouseY();
            if(coordinateInCanvas(mx,my)){
                const hovered = riskCells[riskKey(floor(mx/CELL),floor(my/CELL))];
                if(hovered){
                    push();
                    noFill();
                    stroke(hovered.band.color[0],hovered.band.color[1],hovered.band.color[2],235);
                    strokeWeight(1.5);
                    rect(hovered.x,hovered.y,CELL,CELL);

                    const line1 = 'Human Risk: ' + hovered.band.label;
                    const line2 = 'Risk Index: ' + round(hovered.risk*100) + ' / 100';
                    textSize(12);
                    textStyle(BOLD);
                    const tw = max(textWidth(line1),textWidth(line2));
                    let tx = constrain(mx+12,6,WIDTH-tw-12);
                    let ty = my-10;
                    if(ty < 36) ty = my + 36;
                    fill(0,0,0,190);
                    noStroke();
                    rect(tx-5,ty-29,tw+10,34,4);
                    fill(255);
                    textAlign(LEFT,CENTER);
                    text(line1,tx,ty-19);
                    textStyle(NORMAL);
                    text(line2,tx,ty-6);
                    pop();
                }
            }
        };

        window.__raptorHumanRiskOverlay = {
            buffer: riskBuffer,
            rebuild: ()=>{
                lastRiskTick = -Infinity;
                if(UI.viewBasin instanceof Basin && land && land.drawn)
                    updateRisk(UI.viewBasin);
            },
            get maxRisk(){ return lastMaxRisk; },
            getCellRisk: (x,y)=>{
                if(x===undefined) x = getMouseX();
                if(y===undefined) y = getMouseY();
                return riskCells[riskKey(floor(x/CELL),floor(y/CELL))] || null;
            }
        };
    };
})();

