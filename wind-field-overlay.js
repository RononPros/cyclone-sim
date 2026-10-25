// Display controls are browser settings; wind physics and impact accounting
// continue independently of both switches. The heatmap samples WindField itself.
const CycloneWindOverlay = (()=>{
    const CELL=8;
    const bands=[
        {minimum:17,color:[85,193,235]},
        {minimum:34,color:[255,221,98]},
        {minimum:64,color:[255,166,74]},
        {minimum:96,color:[255,105,103]},
        {minimum:130,color:[224,123,255]}
    ];
    let buffer,cachedBasin,cachedLand,lastSignature,cells=[];
    function bandFor(wind){
        for(let i=bands.length-1;i>=0;i--)if(wind>=bands[i].minimum)return bands[i];
        return null;
    }
    function rebuild(basin,profiles){
        buffer.clear();buffer.noStroke();cells=[];
        if(!profiles.some(p=>p.maximum>=bands[0].minimum))return;
        for(let y=CELL/2;y<HEIGHT;y+=CELL)for(let x=CELL/2;x<WIDTH;x+=CELL){
            const coord=Coordinate.convertFromXY(basin.mapType,x,y);
            const terrain=land.get(coord),wind=WindField.strongest(profiles,coord,terrain).wind;
            const band=bandFor(wind);
            if(!band)continue;
            buffer.fill(...band.color,82);
            buffer.rect(x-CELL/2,y-CELL/2,CELL,CELL);
            cells.push({x,y,coord,terrain,wind});
        }
    }
    function draw(){
        const basin=UI.viewBasin;
        if(!simSettings.showWindField || !(basin instanceof Basin) || !land || !land.drawn || !buffer)return;
        const profiles=WindField.profiles(basin,viewTick);
        // Refresh paused edits as well as live and historical ticks. Speeds,
        // size, position and type all matter even when model time has not moved.
        const signature=viewTick+'|'+profiles.map(p=>[
            p.coord.longitude,p.coord.latitude,p.maximum,p.size,p.data.type
        ].join(',')).join('|');
        if(cachedBasin!==basin || cachedLand!==land || lastSignature!==signature){
            rebuild(basin,profiles);cachedBasin=basin;cachedLand=land;lastSignature=signature;
        }
        drawBuffer(buffer);
        // Preserve the established track/icon order above the coloured cells.
        drawBuffer(tracks);drawBuffer(forecastTracks);drawBuffer(stormIcons);
        push();noStroke();fill(12,20,33,235);
        const x=WIDTH-438,y=33;
        rect(x,y,433,20,3);fill(231,241,250);textSize(10);textStyle(NORMAL);textAlign(LEFT,CENTER);
        text('Cyclone wind · '+CityOverlay.unitName(),x+7,y+10);
        let bx=x+139;
        for(const band of bands){
            fill(...band.color);rect(bx,y+6,8,8,1);
            fill(231,241,250);text('≥'+CityOverlay.number(band.minimum),bx+11,y+10);bx+=58;
        }
        pop();
    }
    const baseOrder=Settings.order,baseDefaults=Settings.defaults;
    Settings.order=function(){return ['showCityWinds','showWindField',...baseOrder.call(Settings)];};
    Settings.defaults=function(){return [true,false,...baseDefaults.call(Settings)];};
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
        sideMenu.append(false,5,366,sideMenu.width-10,28,function(){
            noStroke();fill(COLORS.UI.text);textSize(11);textStyle(NORMAL);textAlign(CENTER,TOP);
            text('Display only — winds and impacts continue',this.width/2,0);
        },false);
        const previousRender=primaryWrapper.renderFunc;
        primaryWrapper.renderFunc=function(s){previousRender.call(this,s);draw();};
    };
    return {CELL,draw,bandFor,get cells(){return cells;}};
})();
