// Optional natural storm spawning control.
// Keeps manual God Mode spawning intact while allowing automatic spawning to be disabled.
(function(){
    const STORAGE_KEY = 'cyclone-sim-natural-spawning';
    let naturalSpawningEnabled = localStorage.getItem(STORAGE_KEY) !== 'false';

    const rememberSetting = ()=>{
        localStorage.setItem(STORAGE_KEY, naturalSpawningEnabled ? 'true' : 'false');
    };

    // Disable only the simulator's automatic SPAWN_RULES call. Manual God Mode
    // spawning uses spawnArchetype()/spawn() directly and is therefore unaffected.
    const originalAdvanceSimOneStep = Basin.prototype.advanceSimOneStep;
    Basin.prototype.advanceSimOneStep = function(){
        if(this.naturalSpawningEnabled !== false)
            return originalAdvanceSimOneStep.call(this);

        const rules = SPAWN_RULES[this.actMode];
        const originalDoSpawn = rules.doSpawn;
        rules.doSpawn = function(){};
        try{
            return originalAdvanceSimOneStep.call(this);
        }finally{
            rules.doSpawn = originalDoSpawn;
        }
    };

    // New basins inherit the value selected on the New Basin screen.
    const originalMount = Basin.prototype.mount;
    Basin.prototype.mount = function(){
        if(this.naturalSpawningEnabled === undefined)
            this.naturalSpawningEnabled = naturalSpawningEnabled;
        naturalSpawningEnabled = this.naturalSpawningEnabled !== false;
        rememberSetting();
        return originalMount.call(this);
    };

    // Persist the setting alongside normal basin save data without changing the
    // simulator's save-format flags. Older saves simply default to enabled.
    const originalSave = Basin.prototype.save;
    Basin.prototype.save = function(){
        const basin = this;
        const result = originalSave.call(this);
        if(!(result instanceof Promise))
            return result;
        return result.then(()=>db.saves.get(basin.saveName)).then(obj=>{
            if(obj && obj.value){
                obj.value.naturalSpawningEnabled = basin.naturalSpawningEnabled !== false;
                return db.saves.put(obj, basin.saveName);
            }
        }).then(()=>{
            basin.lastSaved = basin.tick;
        });
    };

    const originalLoad = Basin.prototype.load;
    Basin.prototype.load = function(){
        const basin = this;
        return originalLoad.call(this).then(result=>{
            return db.saves.get(basin.saveName).then(obj=>{
                basin.naturalSpawningEnabled = !(obj && obj.value && obj.value.naturalSpawningEnabled === false);
                naturalSpawningEnabled = basin.naturalSpawningEnabled;
                rememberSetting();
                return result;
            });
        });
    };

    // Add the selector directly below God Mode and move Advanced down one row.
    const originalUIInit = UI.init;
    UI.init = function(){
        originalUIInit.call(UI);

        const mapTypeSelector = basinCreationMenu.children.find(u=>
            u.width === 400 && u.relY === HEIGHT/8
        );
        const yearSelector = mapTypeSelector && mapTypeSelector.children.find(u=>
            u.relX === 0 && u.relY === 36 && u.width === 0
        );
        const simulationModeSelector = yearSelector && yearSelector.children.find(u=>
            u.relX === 0 && u.relY === 36 && u.width === 400
        );
        const godModeSelector = simulationModeSelector && simulationModeSelector.children.find(u=>
            u.relX === 0 && u.relY === 36 && u.width === 400
        );

        if(!godModeSelector){
            console.warn('Natural spawning toggle: could not locate God Mode selector');
            return;
        }

        const advancedButton = godModeSelector.children.find(u=>
            u.relX === 0 && u.relY === 36 && u.width === 400
        );
        if(advancedButton)
            advancedButton.relY = 72;

        godModeSelector.append(false,0,36,400,28,function(s){
            const state = naturalSpawningEnabled ? 'Enabled' : 'Disabled';
            s.button('Natural Storm Spawning: ' + state,true);
        },function(){
            naturalSpawningEnabled = !naturalSpawningEnabled;
            rememberSetting();
        });
    };
})();
