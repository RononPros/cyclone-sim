// Display controls are browser settings; wind physics and impact accounting
// continue independently of both switches. The heatmap samples WindField itself.
const CycloneWindOverlay = (()=>{
    const CELL=8;
    const bands=[
        {minimum:17,color:[85,193,235]},
        {minimum:34,color:[255,221,98]},
        {minimum:64,color:[255,166,74]},
        {minimum:96,color:[255,105,103]},
        {minimum:130,color:[224,123,255]},
        {minimum:170,color:[255,102,211]},
        {minimum:210,color:[255,239,255]}
    ];
    let buffer,cachedBasin,cachedLand,lastSignature,cells=[];
    function bandFor(wind){
        for(let i=bands.length-1;i>=0;i--)if(wind>=bands[i].minimum)return bands[i];
        return null;
    }
    function rebuild(basin,profiles,gusts){
        buffer.clear();buffer.noStroke();cells=[];
        if(!profiles.some(p=>p.maximum*(gusts?1.45:1)>=bands[0].minimum))return;
        const bounds=MAP_TYPES[MAP_TYPES[basin.mapType].form==='earth'?basin.mapType:6];
        const span=(bounds.east<bounds.west?bounds.east+360:bounds.east)-bounds.west;
        const kmX=span*111.195/WIDTH,kmY=Math.abs(bounds.north-bounds.south)*111.195/HEIGHT;
        function tile(left,top,width,height){
            const x=left+width/2,y=top+height/2;
            const coord=Coordinate.convertFromXY(basin.mapType,x,y);
            const margin=Math.hypot(width*kmX*Math.cos(coord.latitude*Math.PI/180),height*kmY)/2;
            let resolution=CELL;
            for(const p of profiles)if(p.maximum>=64){
                const distance=TemperatureAdjustments.distanceKm(p.coord,coord);
                if(distance<=Math.max(80,p.rmw*2)+margin)resolution=1;
                else if(distance<=Math.max(180,p.rmw*5)+margin)resolution=Math.min(resolution,2);
            }
            if(width>resolution || height>resolution){
                const w=width>resolution?width/2:width,h=height>resolution?height/2:height;
                for(let dy=0;dy<height;dy+=h)for(let dx=0;dx<width;dx+=w)tile(left+dx,top+dy,w,h);
                return;
            }
            const terrain=land.get(coord),wind=WindField.strongest(profiles,coord,terrain).wind;
            const gust=WindField.gustFromWind(basin,wind,coord,terrain,viewTick),value=gusts?gust:wind;
            const band=bandFor(value);
            if(!band)return;
            buffer.fill(...band.color,82);
            buffer.rect(left,top,width,height);
            cells.push({x,y,width,height,coord,terrain,wind,gust,value});
        }
        for(let y=0;y<HEIGHT;y+=CELL)for(let x=0;x<WIDTH;x+=CELL)
            tile(x,y,Math.min(CELL,WIDTH-x),Math.min(CELL,HEIGHT-y));
    }
    function draw(){
        const basin=UI.viewBasin;
        if(!simSettings.showWindField || !(basin instanceof Basin) || !land || !land.drawn || !buffer)return;
        const profiles=WindField.profiles(basin,viewTick);
        const gusts=simSettings.windFieldGusts===true;
        // Refresh paused edits as well as live and historical ticks. Speeds,
        // size, position and type all matter even when model time has not moved.
        const signature=viewTick+'|'+gusts+'|'+basin.seed+'|'+profiles.map(p=>[
            p.coord.longitude,p.coord.latitude,p.maximum,p.size,p.data.type,p.spin,p.motion.east,p.motion.north
        ].join(',')).join('|');
        if(cachedBasin!==basin || cachedLand!==land || lastSignature!==signature){
            rebuild(basin,profiles,gusts);cachedBasin=basin;cachedLand=land;lastSignature=signature;
        }
        drawBuffer(buffer);
        // Preserve the established track/icon order above the coloured cells.
        drawBuffer(tracks);drawBuffer(forecastTracks);drawBuffer(stormIcons);
        push();noStroke();fill(12,20,33,235);
        const x=WIDTH-438,y=33;
        rect(x,y,433,37,3);fill(231,241,250);textSize(10);textStyle(NORMAL);textAlign(LEFT,CENTER);
        text((gusts?'Cyclone gust · est. 3-sec ':'Cyclone wind · 1-min ')+CityOverlay.unitName(),x+7,y+10);
        let bx=x+7;
        for(const band of bands){
            fill(...band.color);rect(bx,y+23,8,8,1);
            fill(231,241,250);text('≥'+CityOverlay.number(band.minimum),bx+11,y+27);bx+=60;
        }
        pop();
    }
    const baseOrder=Settings.order,baseDefaults=Settings.defaults;
    Settings.order=function(){return ['cityWindMode','windFieldGusts','showCityWinds','showWindField',...baseOrder.call(Settings)];};
    Settings.defaults=function(){return [2,false,true,false,...baseDefaults.call(Settings)];};
    const previousInit=UI.init;
    UI.init=function(){
        previousInit.call(UI);
        buffer=createBuffer(WIDTH,HEIGHT);
        cachedBasin=cachedLand=lastSignature=undefined;cells=[];
        for(const [y,key,label,setter] of [
            [300,'showCityWinds','City winds','setShowCityWinds'],
            [330,'showWindField','Cyclone wind field','setShowWindField']
        ])sideMenu.append(false,5,y,sideMenu.width-10,25,function(s){
            s.button(label+': '+(simSettings[key]?'Shown':'Hidden'),false,15);
        },function(){simSettings[setter]('toggle');});
        sideMenu.append(false,5,360,sideMenu.width-10,25,function(s){
            s.button('City values: '+['Wind','Gusts','Wind + gusts'][CityOverlay.mode()],false,14);
        },function(){simSettings.setCityWindMode((CityOverlay.mode()+1)%3);});
        sideMenu.append(false,5,390,sideMenu.width-10,25,function(s){
            s.button('Field values: '+(simSettings.windFieldGusts?'Gusts':'Wind'),false,14);
        },function(){simSettings.setWindFieldGusts('toggle');});
        sideMenu.append(false,5,426,sideMenu.width-10,28,function(){
            noStroke();fill(COLORS.UI.text);textSize(11);textStyle(NORMAL);textAlign(CENTER,TOP);
            text('Display only — winds and impacts continue',this.width/2,0);
        },false);
        const previousRender=primaryWrapper.renderFunc;
        primaryWrapper.renderFunc=function(s){previousRender.call(this,s);draw();};
    };
    return {CELL,draw,bandFor,get cells(){return cells;}};
})();
