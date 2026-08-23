// Raptor Mod 0.16.0: live selected-storm debug diagnostics.
// This module is intentionally observational: it records and displays internal
// state without changing steering, intensity, lifecycle, or environmental fields.
(function(){
    const BUILD = '0.16.0';
    const debugState = new WeakMap();

    // -------------------------------------------------------------------------
    // Persistent Settings toggle
    // -------------------------------------------------------------------------
    const baseSettingsOrder = Settings.order;
    const baseSettingsDefaults = Settings.defaults;
    Settings.order = function(){
        const order = baseSettingsOrder.call(Settings);
        return order.includes('stormDebugMode') ? order : ['stormDebugMode', ...order];
    };
    Settings.defaults = function(){
        const defaults = baseSettingsDefaults.call(Settings);
        const order = baseSettingsOrder.call(Settings);
        return order.includes('stormDebugMode') ? defaults : [false, ...defaults];
    };

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
    const mix = (a,b,t)=>a+(b-a)*t;
    const mapRange = (v,a,b,c,d,doClamp)=>{
        let t = (v-a)/(b-a);
        if(doClamp) t = clamp(t,0,1);
        return c+(d-c)*t;
    };
    const finite = v=>Number.isFinite(Number(v));
    const pct = (v,d)=>finite(v) ? (Number(v)*100).toFixed(d===undefined?0:d)+'%' : 'N/A';
    const num = (v,d,suffix)=>finite(v) ? Number(v).toFixed(d===undefined?1:d)+(suffix||'') : 'N/A';
    const signed = (v,d,suffix)=>{
        if(!finite(v)) return 'N/A';
        v = Number(v);
        return (v>0?'+':'')+v.toFixed(d===undefined?1:d)+(suffix||'');
    };
    const yesNo = v=>v ? 'YES' : 'NO';
    const pass = v=>v ? '\u2713' : '\u2717';

    const typeName = ty=>{
        if(ty===TROP) return 'Tropical';
        if(ty===SUBTROP) return 'Subtropical';
        if(ty===TROPWAVE) return 'Wave / Remnant';
        if(ty===EXTROP) return 'Extratropical';
        return ''+ty;
    };

    const vecObj = v=>{
        if(!v || !finite(v.x) || !finite(v.y)) return null;
        const x = Number(v.x);
        const y = Number(v.y);
        return {x,y,mag:Math.hypot(x,y),angle:Math.atan2(y,x)};
    };

    const vecText = v=>{
        if(!v) return 'N/A';
        let heading;
        try{ heading = compassHeading(v.angle); }
        catch(e){ heading = (v.angle*180/Math.PI).toFixed(0)+' deg'; }
        return v.mag.toFixed(2)+' u/hr  '+heading;
    };

    const recordAtOrBefore = (storm,targetTick)=>{
        if(!(storm instanceof Storm)) return;
        for(let i=storm.record.length-1;i>=0;i--){
            const t = storm.get_tick_from_record_index(i);
            if(t<=targetTick) return {data:storm.record[i],tick:t};
        }
    };

    const changesSince = (storm,tick,hours,currentPressure,currentWind)=>{
        const old = recordAtOrBefore(storm,tick-hours);
        if(!old) return null;
        return {
            pressure: currentPressure-old.data.pressure,
            wind: currentWind-old.data.windSpeed,
            actualHours: tick-old.tick
        };
    };

    const sampledSurfaceHistory = (storm,sys)=>{
        let landHours = 0;
        let oceanHours = 0;
        let currentLand = false;
        try{ currentLand = !!land.get(sys.coord()); }catch(e){}

        if(storm instanceof Storm){
            for(const d of storm.record){
                let onLand = false;
                try{ onLand = !!land.get(d.coord()); }catch(e){}
                if(onLand) landHours += ADVISORY_TICKS;
                else oceanHours += ADVISORY_TICKS;
            }

            const lastTick = storm.record.length ?
                storm.get_tick_from_record_index(storm.record.length-1) : storm.birthTime;
            const tail = Math.max(0,sys.basin.tick-lastTick);
            if(currentLand) landHours += tail;
            else oceanHours += tail;
        }

        let streak = 0;
        if(storm instanceof Storm){
            const lastTick = storm.record.length ?
                storm.get_tick_from_record_index(storm.record.length-1) : storm.birthTime;
            streak += Math.max(0,sys.basin.tick-lastTick);
            for(let i=storm.record.length-1;i>=0;i--){
                let onLand = false;
                try{ onLand = !!land.get(storm.record[i].coord()); }catch(e){}
                if(onLand!==currentLand) break;
                streak += ADVISORY_TICKS;
            }
        }

        return {landHours,oceanHours,currentLand,streak};
    };

    const recoveryInfo = (sys,sample)=>{
        const storm = sys.fetchStorm();
        if(!(storm instanceof Storm) || !sample) return null;

        let recentPeakWind = sys.windSpeed;
        let recentPeakTick = sys.basin.tick;
        const cutoff = sys.basin.tick-72;
        for(let i=storm.record.length-1;i>=0;i--){
            const tick = storm.get_tick_from_record_index(i);
            if(tick<cutoff) break;
            const d = storm.record[i];
            if(d.windSpeed>recentPeakWind){
                recentPeakWind = d.windSpeed;
                recentPeakTick = tick;
            }
        }

        const warmStructure = sys.lowerWarmCore>=0.68 && sys.upperWarmCore>=0.58;
        const tropicalLike = sys.type===TROP || sys.type===SUBTROP || sys.type===TROPWAVE;
        const established = storm.TC && tropicalLike && sys.type!==TROPWAVE &&
            recentPeakWind>=50 && recentPeakWind-sys.windSpeed>=5;
        const remnant = storm.TC && sys.type===TROPWAVE;

        const sstFactor = mapRange(sample.SST,26.0,29.5,0,1,true);
        const moistureFactor = mapRange(sample.moisture,0.42,0.72,0,1,true);
        const shearFactor = mapRange(sample.totalShear,5.0,1.0,0,1,true);
        const favorability = sstFactor*(0.25+0.75*moistureFactor)*(0.15+0.85*shearFactor);
        const active = !sample.onLand && warmStructure && (established || remnant) &&
            sample.SST>=27 && sample.moisture>=0.42 && sample.totalShear<=5 && favorability>=0.12;

        return {
            recentPeakWind,
            recentPeakTick,
            memoryRemaining: Math.max(0,72-(sys.basin.tick-recentPeakTick)),
            favorability,
            established,
            remnant,
            active
        };
    };

    const environmentTier = (sys,sample)=>{
        if(!sample) return {veryFavorable:false,exceptionalRI:false,eliteRI:false};
        const veryFavorable = !sample.onLand &&
            sample.SST>=27.3 && sample.moisture>=0.52 && sample.totalShear<=3.5 &&
            sys.lowerWarmCore>=0.72 && sys.upperWarmCore>=0.62 && sys.organization>=0.48;
        const exceptionalRI = !sample.onLand &&
            sample.SST>=28.0 && sample.moisture>=0.60 && sample.totalShear<=2.5 &&
            sys.lowerWarmCore>=0.82 && sys.upperWarmCore>=0.72 && sys.organization>=0.62;
        const eliteRI = exceptionalRI &&
            sample.SST>=29.2 && sample.moisture>=0.72 && sample.totalShear<=1.2 &&
            sys.lowerWarmCore>=0.94 && sys.upperWarmCore>=0.88 && sys.organization>=0.84;
        return {veryFavorable,exceptionalRI,eliteRI};
    };

    const normalTargets = (sys,sample,recovery)=>{
        if(!sample || sys.basin.actMode!==SIM_MODE_NORMAL) return null;
        const SST = sample.SST;
        const oceanPotential = 1010 - 25*Math.log((sample.onLand || SST<25) ? 1 : mapRange(SST,25,30,1,2,false))/Math.log(1.17);
        const standardPressure = mix(1010,oceanPotential,Math.pow(sys.organization,3));

        let recoveryPressure;
        if(recovery && recovery.active){
            const exponent = recovery.established ? 2.2 : 2.0;
            recoveryPressure = mix(1010,oceanPotential,Math.pow(sys.organization,exponent));
        }

        const pressure = recoveryPressure===undefined ? standardPressure : Math.min(standardPressure,recoveryPressure);
        const wind = mapRange(sys.pressure,1030,900,1,160,false)*mapRange(sys.lowerWarmCore,1,0,1,0.6,false);
        return {oceanPotential,standardPressure,recoveryPressure,pressure,wind};
    };

    const configuredPacing = (tier)=>{
        const tuning = window.__raptorIntensityRateTuning;
        let pRate = 1.96;
        let wRate = 5.6;
        if(tuning){
            try{ if(tuning.pressure && finite(tuning.pressure.rate)) pRate = Number(tuning.pressure.rate); }catch(e){}
            try{ if(tuning.wind && finite(tuning.wind.rate)) wRate = Number(tuning.wind.rate); }catch(e){}
        }

        let pTier = 1;
        let pCap = 1.35;
        let wTier = 1;
        if(tier.veryFavorable){ pTier = 0.62/0.56; pCap = 1.75; wTier = 0.09/0.08; }
        if(tier.exceptionalRI){ pTier = 0.72/0.56; pCap = 2.25; wTier = 0.11/0.08; }
        if(tier.eliteRI){ pTier = 0.82/0.56; pCap = 3.00; wTier = 0.13/0.08; }

        const pFactor = pRate/2.8;
        const wFactor = wRate/8.0;
        const appliedPressureGapRate = Math.min(5,pRate*pTier);
        const hourlyPressureCap = pCap*pFactor;
        const appliedWindGapRate = Math.min(15,wRate*wTier);

        let wind24Cap = Math.min(29,20*wFactor);
        if(tier.veryFavorable) wind24Cap = Math.min(29,29*wFactor);
        if(tier.exceptionalRI) wind24Cap = 45*wFactor;
        if(tier.eliteRI) wind24Cap = Math.min(70,60*wFactor);

        return {pRate,wRate,appliedPressureGapRate,hourlyPressureCap,appliedWindGapRate,wind24Cap};
    };

    const likelyLimiter = (sys,sample,targets)=>{
        if(!sample) return 'UNKNOWN';
        if(sample.onLand) return 'LAND';
        if(sys.type===EXTROP) return 'EXTRATROPICAL STRUCTURE';

        const candidates = [
            ['SHEAR',clamp((sample.totalShear-2.0)/4.0,0,1.5)],
            ['DRY AIR',clamp((0.60-sample.moisture)/0.30,0,1.5)],
            ['SST',clamp((28.0-sample.SST)/4.0,0,1.5)],
            ['ORGANIZATION',clamp((0.70-sys.organization)/0.50,0,1.5)],
            ['LOWER WARM CORE',clamp((0.82-sys.lowerWarmCore)/0.45,0,1.5)],
            ['UPPER WARM CORE',clamp((0.72-sys.upperWarmCore)/0.45,0,1.5)],
            ['JET / BAROCLINIC',sample.jetRelative<45 ? clamp((45-sample.jetRelative)/45,0,1.2) : 0]
        ];
        candidates.sort((a,b)=>b[1]-a[1]);

        if(targets){
            const pGap = sys.pressure-targets.pressure;
            const wGap = targets.wind-sys.windSpeed;
            if(Math.abs(pGap)<3 && wGap>10) return 'WIND LAG';
            if(Math.abs(pGap)<3 && Math.abs(wGap)<8) return 'NEAR POTENTIAL';
        }
        if(candidates[0][1]>=0.22) return candidates[0][0];
        return 'NONE / FAVORABLE';
    };

    const readSample = sys=>{
        if(!(sys instanceof ActiveSystem) || !(sys.basin instanceof Basin)) return null;
        const basin = sys.basin;
        const x = sys.pos.x;
        const y = sys.pos.y;
        const get = field=>{
            try{ return basin.env.get(field,x,y,basin.tick); }
            catch(e){ return null; }
        };

        const shearVec = vecObj(get('shear'));
        const ll = vecObj(get('LLSteering'));
        const ul = vecObj(get('ULSteering'));
        const jetY = get('jetstream');
        const SST = Number(get('SST'));
        const moisture = Number(get('moisture'));
        let onLand = false;
        let landValue = 0;
        try{
            landValue = Number(land.get(sys.coord())) || 0;
            onLand = !!landValue;
        }catch(e){}

        return {
            tick: basin.tick,
            SST,
            moisture,
            envShear: shearVec ? shearVec.mag : NaN,
            interactionShear: Number(sys.interaction && sys.interaction.shear) || 0,
            totalShear: (shearVec ? shearVec.mag : 0) + (Number(sys.interaction && sys.interaction.shear)||0),
            shearVec,
            LL: ll,
            UL: ul,
            finalSteering: vecObj(sys.steering),
            fuji: vecObj(sys.interaction && sys.interaction.fuji),
            jetY: Number(jetY),
            jetRelative: finite(jetY) ? basin.hemY(sys.pos.y)-Number(jetY) : NaN,
            onLand,
            landValue
        };
    };

    const captureAfterCore = (sys,before)=>{
        if(!(sys instanceof ActiveSystem)) return;
        const sample = readSample(sys);
        const state = debugState.get(sys) || {};
        state.tick = sys.basin.tick;
        state.sample = sample;
        state.hourDelta = {
            pressure: sys.pressure-before.pressure,
            wind: sys.windSpeed-before.wind,
            organization: sys.organization-before.organization,
            lowerWarmCore: sys.lowerWarmCore-before.lowerWarmCore,
            upperWarmCore: sys.upperWarmCore-before.upperWarmCore,
            depth: sys.depth-before.depth
        };
        debugState.set(sys,state);
    };

    // Wrap every concrete core function. Modes without their own core continue to
    // use the wrapped defaults core. The wrapper only takes snapshots.
    const wrapCore = obj=>{
        if(!obj || !(obj.core instanceof Function) || obj.core.__raptorStormDebugWrapped) return;
        const previous = obj.core;
        const wrapped = function(sys,u){
            const before = {
                pressure: sys.pressure,
                wind: sys.windSpeed,
                organization: sys.organization,
                lowerWarmCore: sys.lowerWarmCore,
                upperWarmCore: sys.upperWarmCore,
                depth: sys.depth
            };
            previous(sys,u);
            captureAfterCore(sys,before);
        };
        wrapped.__raptorStormDebugWrapped = true;
        obj.core = wrapped;
    };

    wrapCore(STORM_ALGORITHM.defaults);
    for(const k in STORM_ALGORITHM){
        if(k!=='defaults') wrapCore(STORM_ALGORITHM[k]);
    }

    // -------------------------------------------------------------------------
    // UI
    // -------------------------------------------------------------------------
    const previousUIInit = UI.init;
    let debugPanel;

    const walk = (node,pred)=>{
        if(pred(node)) return node;
        for(const child of node.children || []){
            const found = walk(child,pred);
            if(found) return found;
        }
    };

    UI.init = function(){
        previousUIInit.call(UI);

        // Add the toggle immediately below the 0.15.0 wind slider.
        const windSlider = walk(settingsMenu,u=>
            u.renderFunc && u.renderFunc.toString().includes('Wind Intensification')
        );
        if(windSlider){
            windSlider.append(false,0,36,300,28,function(s){
                const b = simSettings.stormDebugMode ? 'Enabled' : 'Disabled';
                s.button('Storm Debug Mode: '+b,true,16);
            },function(){
                simSettings.setStormDebugMode('toggle');
            });

            const back = settingsMenu.children.find(u=>
                u.width===300 && u.height===30 && u.relY>HEIGHT/2 &&
                u.renderFunc && u.renderFunc.toString().includes('Back')
            );
            if(back) back.relY = HEIGHT-38;
        }else{
            console.warn('Raptor storm debug: wind slider not found; Settings toggle was not attached');
        }

        debugPanel = primaryWrapper.append(false,8,38,635,464,function(s){
            if(!simSettings || !simSettings.stormDebugMode) return;

            push();
            fill(0,0,0,218);
            stroke(255,255,255,90);
            strokeWeight(1);
            s.fullRect();
            noStroke();
            fill(COLORS.UI.text);
            textStyle(NORMAL);
            textFont('monospace');

            const storm = selectedStorm;
            if(!(storm instanceof Storm)){
                textAlign(CENTER,CENTER);
                textSize(15);
                text('STORM DEBUG MODE  |  Select an active storm',this.width/2,22);
                pop();
                return;
            }

            const sys = storm.current;
            if(!(sys instanceof ActiveSystem) || !(UI.viewBasin instanceof Basin) || !UI.viewBasin.viewingPresent()){
                textAlign(CENTER,CENTER);
                textSize(15);
                text('STORM DEBUG MODE  |  Live diagnostics require an active storm at Present',this.width/2,22);
                pop();
                return;
            }

            let state = debugState.get(sys);
            if(!state){
                state = {tick:sys.basin.tick,sample:readSample(sys)};
                debugState.set(sys,state);
            }
            const sample = state.sample && state.sample.tick===sys.basin.tick ? state.sample : readSample(sys);
            state.sample = sample;

            const tier = environmentTier(sys,sample);
            const recovery = sys.basin.actMode===SIM_MODE_NORMAL ? recoveryInfo(sys,sample) : null;
            const targets = normalTargets(sys,sample,recovery);
            const pacing = configuredPacing(tier);
            const limiter = likelyLimiter(sys,sample,targets);
            const coord = sys.coord();
            const scale = (()=>{
                try{ return sys.basin.getScale(land.getSubBasin(coord)); }
                catch(e){ return null; }
            })();
            const className = scale ? scale.getClassificationName(sys) : 'N/A';
            let peakClass = 'N/A';
            if(storm.windPeak){
                try{
                    const ps = sys.basin.getScale(land.getSubBasin(storm.windPeak.coord()));
                    peakClass = ps.getClassificationName(storm.windPeak);
                }catch(e){}
            }

            const d1 = state.hourDelta || {};
            const d6 = changesSince(storm,sys.basin.tick,6,sys.pressure,sys.windSpeed);
            const d12 = changesSince(storm,sys.basin.tick,12,sys.pressure,sys.windSpeed);
            const d24 = changesSince(storm,sys.basin.tick,24,sys.pressure,sys.windSpeed);
            const surfaces = sampledSurfaceHistory(storm,sys);
            const ulWeight = Math.sqrt(clamp(sys.depth,0,1));
            const llWeight = 1-ulWeight;
            const modeName = SIMULATION_MODES[sys.basin.actMode] || ('Mode '+sys.basin.actMode);
            const name = storm.getFullNameByTick(sys.basin.tick) || storm.getFullNameByTick('peak') || 'Unnamed system';

            let latTxt = finite(coord.latitude) ? Math.abs(coord.latitude).toFixed(2)+'\u00b0'+(coord.latitude>=0?'N':'S') : 'N/A';
            let lonTxt = finite(coord.longitude) ? Math.abs(coord.longitude).toFixed(2)+'\u00b0'+(coord.longitude>=0?'E':'W') : 'N/A';

            textAlign(LEFT,TOP);
            textSize(14);
            textStyle(BOLD);
            text('STORM DEBUG  |  '+name,10,7);
            textStyle(NORMAL);
            textSize(10);
            text(modeName+'  |  Tick '+sys.basin.tick+'  |  '+latTxt+' '+lonTxt,10,25);
            line(10,39,this.width-10,39);

            const colW = 302;
            const leftX = 10;
            const rightX = 323;
            const startY = 47;
            const lineH = 14;

            const section = (x,y,title)=>{
                fill(COLORS.UI.text);
                textStyle(BOLD);
                textSize(11);
                text(title,x,y);
                textStyle(NORMAL);
                textSize(10);
                return y+lineH;
            };
            const row = (x,y,label,value)=>{
                fill(COLORS.UI.greyText || COLORS.UI.text);
                textAlign(LEFT,TOP);
                text(label,x,y);
                fill(COLORS.UI.text);
                textAlign(RIGHT,TOP);
                text(value,x+colW,y);
                return y+lineH;
            };
            const compact = (x,y,textValue)=>{
                fill(COLORS.UI.text);
                textAlign(LEFT,TOP);
                text(textValue,x,y);
                return y+lineH;
            };

            let yL = startY;
            yL = section(leftX,yL,'CORE / INTENSITY');
            yL = row(leftX,yL,'Type / class',typeName(sys.type)+' / '+className);
            yL = row(leftX,yL,'Wind',num(sys.windSpeed,1,' kt'));
            yL = row(leftX,yL,'Wind target',targets ? num(targets.wind,1,' kt') : 'N/A outside Normal');
            yL = row(leftX,yL,'Wind target gap',targets ? signed(targets.wind-sys.windSpeed,1,' kt') : 'N/A');
            yL = row(leftX,yL,'Pressure',num(sys.pressure,1,' hPa'));
            yL = row(leftX,yL,'Pressure target',targets ? num(targets.pressure,1,' hPa') : 'N/A outside Normal');
            yL = row(leftX,yL,'Pressure target gap',targets ? signed(targets.pressure-sys.pressure,1,' hPa') : 'N/A');
            yL = row(leftX,yL,'Ocean potential',targets ? num(targets.oceanPotential,1,' hPa') : 'N/A');
            yL = row(leftX,yL,'Organization',pct(sys.organization,1));
            yL = row(leftX,yL,'Depth',pct(sys.depth,1));
            yL = row(leftX,yL,'Lower / upper warm core',pct(sys.lowerWarmCore,1)+' / '+pct(sys.upperWarmCore,1));

            yL += 3;
            yL = section(leftX,yL,'PACING / CHANGE');
            yL = row(leftX,yL,'Configured P / W',pacing.pRate.toFixed(2)+'% / '+pacing.wRate.toFixed(1)+'% gap/hr');
            yL = row(leftX,yL,'Applied P / W',pacing.appliedPressureGapRate.toFixed(2)+'% / '+pacing.appliedWindGapRate.toFixed(1)+'% gap/hr');
            yL = row(leftX,yL,'Hourly pressure cap',pacing.hourlyPressureCap.toFixed(2)+' hPa/hr');
            yL = row(leftX,yL,'24h wind gain cap',pacing.wind24Cap.toFixed(1)+' kt/24h');
            yL = row(leftX,yL,'Last hour P / W',signed(d1.pressure,2,' hPa')+' / '+signed(d1.wind,2,' kt'));
            yL = row(leftX,yL,'6h P / W',d6 ? signed(d6.pressure,1,' hPa')+' / '+signed(d6.wind,1,' kt') : 'N/A');
            yL = row(leftX,yL,'12h P / W',d12 ? signed(d12.pressure,1,' hPa')+' / '+signed(d12.wind,1,' kt') : 'N/A');
            yL = row(leftX,yL,'24h P / W',d24 ? signed(d24.pressure,1,' hPa')+' / '+signed(d24.wind,1,' kt') : 'N/A');
            yL = row(leftX,yL,'Org change / hr',signed(d1.organization*100,2,' pp'));
            yL = row(leftX,yL,'LWC / UWC change / hr',signed(d1.lowerWarmCore*100,2,' pp')+' / '+signed(d1.upperWarmCore*100,2,' pp'));
            yL = row(leftX,yL,'Depth change / hr',signed(d1.depth*100,2,' pp'));

            yL += 3;
            yL = section(leftX,yL,'HISTORY / IMPACT');
            yL = row(leftX,yL,'Peak wind / class',storm.windPeak ? num(storm.windPeak.windSpeed,0,' kt')+' / '+peakClass : 'N/A');
            yL = row(leftX,yL,'Peak pressure',storm.peak ? num(storm.peak.pressure,0,' hPa') : 'N/A');
            const aceNow = (typeof ACE_WIND_THRESHOLD!=='undefined' && typeof ACE_DIVISOR!=='undefined' && tropOrSub(sys.type) && sys.windSpeed>=ACE_WIND_THRESHOLD) ? Math.pow(sys.windSpeed,2)/ACE_DIVISOR : 0;
            yL = row(leftX,yL,'ACE total / next advisory',num(storm.ACE,4)+' / '+num(aceNow,4));
            yL = row(leftX,yL,'Damage / deaths / landfalls',(typeof damageDisplayNumber==='function'?damageDisplayNumber(storm.damage):storm.damage)+' / '+storm.deaths+' / '+storm.landfalls);
            yL = row(leftX,yL,'Storm / tropical age',num(sys.basin.tick-storm.birthTime,0,' h')+' / '+(storm.formationTime===undefined?'N/A':num(sys.basin.tick-storm.formationTime,0,' h')));

            let yR = startY;
            yR = section(rightX,yR,'ENVIRONMENT');
            yR = row(rightX,yR,'SST',num(sample && sample.SST,2,' \u00b0C'));
            yR = row(rightX,yR,'Moisture',pct(sample && sample.moisture,1));
            yR = row(rightX,yR,'Shear env / interaction',num(sample && sample.envShear,2,' u/hr')+' / '+num(sample && sample.interactionShear,2,' u/hr'));
            yR = row(rightX,yR,'Total shear',num(sample && sample.totalShear,2,' u/hr'));
            yR = row(rightX,yR,'Surface',sample && sample.onLand ? 'LAND  value '+num(sample.landValue,3) : 'OCEAN');
            yR = row(rightX,yR,'Jet relative',num(sample && sample.jetRelative,1,' px'));
            yR = row(rightX,yR,'Likely limiter',limiter+'  [heuristic]');

            yR += 3;
            yR = section(rightX,yR,'RI / RECOVERY');
            if(sys.basin.actMode===SIM_MODE_NORMAL){
                yR = row(rightX,yR,'Very favorable',yesNo(tier.veryFavorable));
                yR = row(rightX,yR,'RI eligible',yesNo(tier.exceptionalRI));
                yR = row(rightX,yR,'Elite RI',yesNo(tier.eliteRI));
                yR = compact(rightX,yR,'RI gates  SST '+pass(sample.SST>=28)+'  Moist '+pass(sample.moisture>=0.60)+'  Shear '+pass(sample.totalShear<=2.5));
                yR = compact(rightX,yR,'          LWC '+pass(sys.lowerWarmCore>=0.82)+'  UWC '+pass(sys.upperWarmCore>=0.72)+'  Org '+pass(sys.organization>=0.62));
                yR = row(rightX,yR,'Recovery active',recovery ? yesNo(recovery.active) : 'N/A');
                yR = row(rightX,yR,'Recovery flavor',recovery ? (recovery.established?'Established TC':recovery.remnant?'Remnant':'None') : 'N/A');
                yR = row(rightX,yR,'Recovery favorability',recovery ? pct(recovery.favorability,1) : 'N/A');
                yR = row(rightX,yR,'72h memory remaining',recovery ? num(recovery.memoryRemaining,0,' h') : 'N/A');
            }else{
                yR = compact(rightX,yR,'0.15 RI/recovery gates: N/A outside Normal mode');
            }
            yR = row(rightX,yR,'Weak-low timer',num(sys.weakSystemHours || 0,0,' / 18 h'));

            yR += 3;
            yR = section(rightX,yR,'STEERING / INTERACTION');
            yR = row(rightX,yR,'Low-level steering',vecText(sample && sample.LL));
            yR = row(rightX,yR,'Upper-level steering',vecText(sample && sample.UL));
            yR = row(rightX,yR,'LL / UL blend',pct(llWeight,1)+' / '+pct(ulWeight,1));
            yR = row(rightX,yR,'Final steering',vecText(sample && sample.finalSteering));
            yR = row(rightX,yR,'Fujiwhara vector',vecText(sample && sample.fuji));
            yR = row(rightX,yR,'Interaction kill',yesNo(!!(sys.interaction && sys.interaction.kill)));

            yR += 3;
            yR = section(rightX,yR,'POSITION / FLAGS');
            yR = row(rightX,yR,'Latitude / longitude',latTxt+' / '+lonTxt);
            yR = row(rightX,yR,'Surface time sampled',num(surfaces.oceanHours,0,' h ocean')+' / '+num(surfaces.landHours,0,' h land'));
            yR = row(rightX,yR,'Current surface streak',num(surfaces.streak,0,' h ')+(surfaces.currentLand?'land':'ocean'));
            yR = row(rightX,yR,'TC / in-basin TC',yesNo(storm.TC)+' / '+yesNo(storm.inBasinTC));
            yR = row(rightX,yR,'System kill flag',yesNo(!!sys.kill));

            pop();
        });
    };

    window.__raptorStormDebug = {
        build: BUILD,
        state: debugState,
        readSample,
        environmentTier,
        recoveryInfo,
        normalTargets,
        likelyLimiter
    };
})();
