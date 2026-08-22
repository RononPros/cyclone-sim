// Raptor Mod 0.14.0: configurable global Normal-mode intensity pacing.
// Keeps the 0.13.0 RI governor, but lets the user choose how quickly tropical
// cyclones approach their pressure/wind potential. 100% reproduces 0.13.0.
(function(){
    const BUILD = '0.14.0';
    const MIN_RATE = 25;
    const MAX_RATE = 125;
    const RATE_STEP = 5;
    const DEFAULT_RATE = 70;

    // Persist the new control without breaking older Settings arrays. New settings
    // belong at the beginning so old saved values still pop into their old keys.
    const baseSettingsOrder = Settings.order;
    const baseSettingsDefaults = Settings.defaults;
    Settings.order = function(){
        const order = baseSettingsOrder.call(Settings);
        return order.includes('intensityRate') ? order : ['intensityRate', ...order];
    };
    Settings.defaults = function(){
        const defaults = baseSettingsDefaults.call(Settings);
        const oldOrder = baseSettingsOrder.call(Settings);
        return oldOrder.includes('intensityRate') ? defaults : [DEFAULT_RATE, ...defaults];
    };

    const ratePercent = ()=>{
        let v = Number(simSettings && simSettings.intensityRate);
        if(!Number.isFinite(v)) v = DEFAULT_RATE;
        v = constrain(v,MIN_RATE,MAX_RATE);
        return round(v/RATE_STEP)*RATE_STEP;
    };
    const rateFactor = ()=>ratePercent()/100;

    // -------------------------------------------------------------------------
    // Settings slider
    // -------------------------------------------------------------------------
    const previousUIInit = UI.init;
    let intensitySlider;
    let draggingSlider = false;

    const sliderBounds = el=>({
        left: el.getX(),
        right: el.getX()+el.width,
        top: el.getY(),
        bottom: el.getY()+el.height
    });

    const mouseInSlider = ()=>{
        if(!intensitySlider || !settingsMenu || !settingsMenu.showing) return false;
        const b = sliderBounds(intensitySlider);
        const x = getMouseX();
        const y = getMouseY();
        return x>=b.left && x<b.right && y>=b.top && y<b.bottom;
    };

    const setRateFromMouse = save=>{
        if(!intensitySlider || !simSettings) return;
        const trackLeft = 12;
        const trackRight = intensitySlider.width-12;
        const localX = constrain(getMouseX()-intensitySlider.getX(),trackLeft,trackRight);
        let value = map(localX,trackLeft,trackRight,MIN_RATE,MAX_RATE);
        value = constrain(round(value/RATE_STEP)*RATE_STEP,MIN_RATE,MAX_RATE);
        if(simSettings.intensityRate!==value){
            simSettings.intensityRate = value;
            if(save) simSettings.save();
        }else if(save){
            simSettings.save();
        }
    };

    UI.init = function(){
        previousUIInit.call(UI);

        // Human Risk already compacts the stock Settings chain. Reflow it once
        // more to a 30 px pitch so the slider fits cleanly above Back.
        const firstSetting = settingsMenu.children.find(u=>
            u.width===300 && u.height===30 &&
            u.relX===WIDTH/2-150 && u.relY<HEIGHT/2 &&
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

            for(let i=1;i<chain.length;i++) chain[i].relY = 30;

            const last = chain[chain.length-1];
            intensitySlider = last.append(false,0,30,300,38,function(s){
                if(this.isHovered()){
                    fill(COLORS.UI.buttonHover);
                    noStroke();
                    s.fullRect();
                }

                const value = ratePercent();
                const trackLeft = 12;
                const trackRight = this.width-12;
                const trackY = 27;
                const knobX = map(value,MIN_RATE,MAX_RATE,trackLeft,trackRight,true);

                fill(COLORS.UI.text);
                noStroke();
                textAlign(CENTER,TOP);
                textStyle(NORMAL);
                textSize(15);
                text('Storm Intensification Rate: '+value+'%',this.width/2,1);

                stroke(COLORS.UI.nonSelectedInput);
                strokeWeight(4);
                line(trackLeft,trackY,trackRight,trackY);

                stroke(COLORS.UI.text);
                strokeWeight(9);
                point(knobX,trackY);
                strokeWeight(1);
            },function(){
                setRateFromMouse(true);
            });
        }else{
            console.warn('Raptor intensity-rate tuning: Settings chain not found');
        }
    };

    // Give the custom slider normal drag behavior. While dragging, update live;
    // save once on release instead of hammering IndexedDB every mousemove.
    const previousMousePressed = window.mousePressed;
    const previousMouseDragged = window.mouseDragged;
    const previousMouseReleased = window.mouseReleased;

    window.mousePressed = function(event){
        if(mouseInSlider()){
            draggingSlider = true;
            setRateFromMouse(false);
            return false;
        }
        if(previousMousePressed instanceof Function)
            return previousMousePressed.call(this,event);
    };

    window.mouseDragged = function(event){
        if(draggingSlider){
            setRateFromMouse(false);
            return false;
        }
        if(previousMouseDragged instanceof Function)
            return previousMouseDragged.call(this,event);
    };

    window.mouseReleased = function(event){
        if(draggingSlider){
            setRateFromMouse(false);
            draggingSlider = false;
            if(simSettings) simSettings.save();
            return false;
        }
        if(previousMouseReleased instanceof Function)
            return previousMouseReleased.call(this,event);
    };

    // -------------------------------------------------------------------------
    // Global Normal-mode tropical intensification governor
    // -------------------------------------------------------------------------
    const previousNormalCore = STORM_ALGORITHM[SIM_MODE_NORMAL].core;

    const findWind24HoursAgo = (storm,tick)=>{
        if(!(storm instanceof Storm)) return undefined;
        const target = tick-24;
        for(let i=storm.record.length-1;i>=0;i--){
            const t = storm.get_tick_from_record_index(i);
            if(t<=target){
                const d = storm.record[i];
                if(tropOrSub(d.type) || d.type===TROPWAVE)
                    return d.windSpeed;
                return undefined;
            }
        }
    };

    STORM_ALGORITHM[SIM_MODE_NORMAL].core = function(sys,u){
        const pressureBefore = sys.pressure;
        const windBefore = sys.windSpeed;

        previousNormalCore(sys,u);
        if(sys.kill) return;

        const proposedPressure = sys.pressure;
        const proposedWind = sys.windSpeed;
        const tropicalLike = sys.type===TROP || sys.type===SUBTROP || sys.type===TROPWAVE;

        // Leave extratropical intensity changes alone. This control is specifically
        // for tropical-cyclone strengthening pacing in Normal mode.
        if(!tropicalLike) return;

        const lnd = u.land();
        const SST = u.f('SST');
        const moisture = u.f('moisture');
        const shear = u.f('shear').mag()+sys.interaction.shear;

        const veryFavorable = !lnd &&
            SST>=27.3 && moisture>=0.52 && shear<=3.5 &&
            sys.lowerWarmCore>=0.72 && sys.upperWarmCore>=0.62 &&
            sys.organization>=0.48;

        // RI remains environmentally gated regardless of slider position.
        const exceptionalRI = !lnd &&
            SST>=28.0 && moisture>=0.60 && shear<=2.5 &&
            sys.lowerWarmCore>=0.82 && sys.upperWarmCore>=0.72 &&
            sys.organization>=0.62;

        const eliteRI = exceptionalRI &&
            SST>=29.2 && moisture>=0.72 && shear<=1.2 &&
            sys.lowerWarmCore>=0.94 && sys.upperWarmCore>=0.88 &&
            sys.organization>=0.84;

        const factor = rateFactor();

        // --- Pressure pacing --------------------------------------------------
        // At 100%, these are exactly the 0.13.0 rates. The new default is 70%,
        // making routine deepening ~1.96% of the potential-pressure gap per hour
        // instead of ~2.8%. Weakening remains untouched.
        if(proposedPressure < pressureBefore){
            let pressureScale = 0.56;
            let hourlyPressureCap = 1.35;
            if(veryFavorable){
                pressureScale = 0.62;
                hourlyPressureCap = 1.75;
            }
            if(exceptionalRI){
                pressureScale = 0.72;
                hourlyPressureCap = 2.25;
            }
            if(eliteRI){
                pressureScale = 0.82;
                hourlyPressureCap = 3.0;
            }

            pressureScale = min(pressureScale*factor,1);
            hourlyPressureCap *= factor;

            const proposedDrop = pressureBefore-proposedPressure;
            const pacedDrop = min(proposedDrop*pressureScale,hourlyPressureCap);
            sys.pressure = pressureBefore-pacedDrop;
        }

        // --- Wind pacing ------------------------------------------------------
        if(proposedWind > windBefore){
            let windRate = 0.08;
            if(veryFavorable) windRate = 0.09;
            if(exceptionalRI) windRate = 0.11;
            if(eliteRI) windRate = 0.13;
            windRate = min(windRate*factor,0.15);

            const targetWind = map(sys.pressure,1030,900,1,160)*
                map(sys.lowerWarmCore,1,0,1,0.6);
            let pacedWind = targetWind>windBefore ?
                lerp(windBefore,targetWind,windRate) : windBefore;

            // The slider is still a governor. Even above 100%, it cannot exceed
            // the strengthening that the underlying storm physics proposed.
            pacedWind = min(pacedWind,proposedWind);

            // --- 24-hour RI governor -----------------------------------------
            // Non-RI environments stay below +30 kt/day at every slider setting.
            // Exceptional/elite setups scale with the slider and can cross the RI
            // threshold when conditions and the selected pacing both allow it.
            const storm = sys.fetchStorm();
            const wind24 = findWind24HoursAgo(storm,sys.basin.tick);
            if(wind24!==undefined){
                let maxGain24 = min(29,20*factor);
                if(veryFavorable) maxGain24 = min(29,29*factor);
                if(exceptionalRI) maxGain24 = 45*factor;
                if(eliteRI) maxGain24 = min(70,60*factor);
                const ceiling = wind24+maxGain24;
                pacedWind = min(pacedWind,max(windBefore,ceiling));
            }

            sys.windSpeed = pacedWind;
        }
    };

    window.__raptorIntensityRateTuning = {
        build: BUILD,
        minRate: MIN_RATE,
        maxRate: MAX_RATE,
        step: RATE_STEP,
        defaultRate: DEFAULT_RATE,
        get rate(){ return ratePercent(); },
        get factor(){ return rateFactor(); },
        baselinePressureScaleAt100: 0.56,
        baselineWindRateAt100: 0.08,
        ordinary24hGainCapAt100: 20,
        veryFavorable24hGainCapAt100: 29,
        exceptional24hGainCapAt100: 45,
        elite24hGainCapAt100: 60
    };
})();
