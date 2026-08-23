// Raptor Mod 0.15.0: separate configurable Normal-mode pressure/wind pacing.
// Splits the old combined intensification slider into two direct response-rate
// controls. Values are expressed as percent of the remaining target gap per hour.
(function(){
    const BUILD = '0.15.0';

    const LEGACY_COMBINED_DEFAULT = 70;

    const PRESSURE_MIN = 0.50;
    const PRESSURE_MAX = 5.00;
    const PRESSURE_STEP = 0.01;
    const PRESSURE_DEFAULT = 1.96; // 70% of the 0.13.0 2.8%/h baseline
    const PRESSURE_REFERENCE = 2.80;

    const WIND_MIN = 2.0;
    const WIND_MAX = 15.0;
    const WIND_STEP = 0.1;
    const WIND_DEFAULT = 5.6; // 70% of the 0.13.0 8%/h baseline
    const WIND_REFERENCE = 8.0;

    // Keep the 0.14.0 combined setting as a hidden legacy slot so existing saved
    // Settings arrays still line up correctly. New installs use the two controls.
    const baseSettingsOrder = Settings.order;
    const baseSettingsDefaults = Settings.defaults;
    Settings.order = function(){
        const order = baseSettingsOrder.call(Settings);
        const extras = [];
        if(!order.includes('windIntensificationRate')) extras.push('windIntensificationRate');
        if(!order.includes('pressureDeepeningRate')) extras.push('pressureDeepeningRate');
        if(!order.includes('intensityRate')) extras.push('intensityRate');
        return [...extras, ...order];
    };
    Settings.defaults = function(){
        const defaults = baseSettingsDefaults.call(Settings);
        const order = baseSettingsOrder.call(Settings);
        const extras = [];
        if(!order.includes('windIntensificationRate')) extras.push(WIND_DEFAULT);
        if(!order.includes('pressureDeepeningRate')) extras.push(PRESSURE_DEFAULT);
        if(!order.includes('intensityRate')) extras.push(LEGACY_COMBINED_DEFAULT);
        return [...extras, ...defaults];
    };

    const snap = (v,min,max,step,decimals)=>{
        v = constrain(Number(v),min,max);
        v = round(v/step)*step;
        return Number(v.toFixed(decimals));
    };

    const pressureRate = ()=>{
        let v = Number(simSettings && simSettings.pressureDeepeningRate);
        if(!Number.isFinite(v)) v = PRESSURE_DEFAULT;
        return snap(v,PRESSURE_MIN,PRESSURE_MAX,PRESSURE_STEP,2);
    };

    const windRate = ()=>{
        let v = Number(simSettings && simSettings.windIntensificationRate);
        if(!Number.isFinite(v)) v = WIND_DEFAULT;
        return snap(v,WIND_MIN,WIND_MAX,WIND_STEP,1);
    };

    const pressureFactor = ()=>pressureRate()/PRESSURE_REFERENCE;
    const windFactor = ()=>windRate()/WIND_REFERENCE;

    // -------------------------------------------------------------------------
    // Settings sliders
    // -------------------------------------------------------------------------
    const previousUIInit = UI.init;
    let pressureSlider;
    let windSlider;
    let draggingSlider;

    const sliderBounds = el=>({
        left: el.getX(),
        right: el.getX()+el.width,
        top: el.getY(),
        bottom: el.getY()+el.height
    });

    const descriptorFor = el=>{
        if(el===pressureSlider){
            return {
                key: 'pressureDeepeningRate',
                min: PRESSURE_MIN,
                max: PRESSURE_MAX,
                step: PRESSURE_STEP,
                decimals: 2
            };
        }
        if(el===windSlider){
            return {
                key: 'windIntensificationRate',
                min: WIND_MIN,
                max: WIND_MAX,
                step: WIND_STEP,
                decimals: 1
            };
        }
    };

    const sliderUnderMouse = ()=>{
        if(!settingsMenu || !settingsMenu.showing) return;
        const x = getMouseX();
        const y = getMouseY();
        for(const el of [pressureSlider,windSlider]){
            if(!el) continue;
            const b = sliderBounds(el);
            if(x>=b.left && x<b.right && y>=b.top && y<b.bottom) return el;
        }
    };

    const setSliderFromMouse = (el,save)=>{
        const d = descriptorFor(el);
        if(!d || !simSettings) return;
        const trackLeft = 12;
        const trackRight = el.width-12;
        const localX = constrain(getMouseX()-el.getX(),trackLeft,trackRight);
        let value = map(localX,trackLeft,trackRight,d.min,d.max);
        value = snap(value,d.min,d.max,d.step,d.decimals);
        if(simSettings[d.key]!==value){
            simSettings[d.key] = value;
            if(save) simSettings.save();
        }else if(save){
            simSettings.save();
        }
    };

    const renderSlider = (el,s,label,value,min,max,decimals)=>{
        if(el.isHovered()){
            fill(COLORS.UI.buttonHover);
            noStroke();
            s.fullRect();
        }

        const trackLeft = 12;
        const trackRight = el.width-12;
        const trackY = 24;
        const knobX = map(value,min,max,trackLeft,trackRight,true);

        fill(COLORS.UI.text);
        noStroke();
        textAlign(CENTER,TOP);
        textStyle(NORMAL);
        textSize(14);
        text(label+': '+value.toFixed(decimals)+'% gap/hr',el.width/2,0);

        stroke(COLORS.UI.nonSelectedInput);
        strokeWeight(4);
        line(trackLeft,trackY,trackRight,trackY);
        stroke(COLORS.UI.text);
        strokeWeight(9);
        point(knobX,trackY);
        strokeWeight(1);
    };

    UI.init = function(){
        previousUIInit.call(UI);

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

            // Ten regular settings buttons need to leave room for two compact sliders.
            for(let i=1;i<chain.length;i++) chain[i].relY = 27;

            const last = chain[chain.length-1];
            pressureSlider = last.append(false,0,30,300,34,function(s){
                renderSlider(this,s,'Pressure Deepening',pressureRate(),PRESSURE_MIN,PRESSURE_MAX,2);
            },function(){
                setSliderFromMouse(pressureSlider,true);
            });

            windSlider = pressureSlider.append(false,0,36,300,34,function(s){
                renderSlider(this,s,'Wind Intensification',windRate(),WIND_MIN,WIND_MAX,1);
            },function(){
                setSliderFromMouse(windSlider,true);
            });
        }else{
            console.warn('Raptor intensity-rate tuning: Settings chain not found');
        }
    };

    const previousMousePressed = window.mousePressed;
    const previousMouseDragged = window.mouseDragged;
    const previousMouseReleased = window.mouseReleased;

    window.mousePressed = function(event){
        const el = sliderUnderMouse();
        if(el){
            draggingSlider = el;
            setSliderFromMouse(el,false);
            return false;
        }
        if(previousMousePressed instanceof Function)
            return previousMousePressed.call(this,event);
    };

    window.mouseDragged = function(event){
        if(draggingSlider){
            setSliderFromMouse(draggingSlider,false);
            return false;
        }
        if(previousMouseDragged instanceof Function)
            return previousMouseDragged.call(this,event);
    };

    window.mouseReleased = function(event){
        if(draggingSlider){
            setSliderFromMouse(draggingSlider,false);
            draggingSlider = undefined;
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
        if(!tropicalLike) return;

        const lnd = u.land();
        const SST = u.f('SST');
        const moisture = u.f('moisture');
        const shear = u.f('shear').mag()+sys.interaction.shear;

        const veryFavorable = !lnd &&
            SST>=27.3 && moisture>=0.52 && shear<=3.5 &&
            sys.lowerWarmCore>=0.72 && sys.upperWarmCore>=0.62 &&
            sys.organization>=0.48;

        const exceptionalRI = !lnd &&
            SST>=28.0 && moisture>=0.60 && shear<=2.5 &&
            sys.lowerWarmCore>=0.82 && sys.upperWarmCore>=0.72 &&
            sys.organization>=0.62;

        const eliteRI = exceptionalRI &&
            SST>=29.2 && moisture>=0.72 && shear<=1.2 &&
            sys.lowerWarmCore>=0.94 && sys.upperWarmCore>=0.88 &&
            sys.organization>=0.84;

        const pFactor = pressureFactor();
        const wFactor = windFactor();

        // Pressure slider controls only pressure deepening and its hourly absolute
        // safety cap. At the default 1.96% gap/hr this is exactly 0.14.0's 70% pace.
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

            pressureScale = min(pressureScale*pFactor,1);
            hourlyPressureCap *= pFactor;

            const proposedDrop = pressureBefore-proposedPressure;
            const pacedDrop = min(proposedDrop*pressureScale,hourlyPressureCap);
            sys.pressure = pressureBefore-pacedDrop;
        }

        // Wind slider controls only strengthening toward the pressure-derived wind
        // target and the rolling 24-hour wind-gain ceiling. Weakening is untouched.
        if(proposedWind > windBefore){
            let tierMultiplier = 1;
            if(veryFavorable) tierMultiplier = 0.09/0.08;
            if(exceptionalRI) tierMultiplier = 0.11/0.08;
            if(eliteRI) tierMultiplier = 0.13/0.08;
            const hourlyWindRate = min((windRate()/100)*tierMultiplier,0.15);

            const targetWind = map(sys.pressure,1030,900,1,160)*
                map(sys.lowerWarmCore,1,0,1,0.6);
            let pacedWind = targetWind>windBefore ?
                lerp(windBefore,targetWind,hourlyWindRate) : windBefore;
            pacedWind = min(pacedWind,proposedWind);

            const storm = sys.fetchStorm();
            const wind24 = findWind24HoursAgo(storm,sys.basin.tick);
            if(wind24!==undefined){
                let maxGain24 = min(29,20*wFactor);
                if(veryFavorable) maxGain24 = min(29,29*wFactor);
                if(exceptionalRI) maxGain24 = 45*wFactor;
                if(eliteRI) maxGain24 = min(70,60*wFactor);
                const ceiling = wind24+maxGain24;
                pacedWind = min(pacedWind,max(windBefore,ceiling));
            }

            sys.windSpeed = pacedWind;
        }
    };

    window.__raptorIntensityRateTuning = {
        build: BUILD,
        pressure: {
            min: PRESSURE_MIN,
            max: PRESSURE_MAX,
            step: PRESSURE_STEP,
            default: PRESSURE_DEFAULT,
            get rate(){ return pressureRate(); }
        },
        wind: {
            min: WIND_MIN,
            max: WIND_MAX,
            step: WIND_STEP,
            default: WIND_DEFAULT,
            get rate(){ return windRate(); }
        },
        get pressureFactor(){ return pressureFactor(); },
        get windFactor(){ return windFactor(); }
    };
})();
