// Raptor Mod 0.17.3 release metadata for the Western Pacific shear overhaul.
// Loaded after the base release coordinator so the newest build marker and
// changelog entry are visible without rewriting older release history.
(function(){
    const BUILD = '0.17.3';
    const BUILD_DATE = '9 Sep 2026';
    const release = {
        build: BUILD,
        date: BUILD_DATE,
        changes: [
            'Overhauled Normal-mode Western Pacific vertical-wind-shear climatology after testing showed excessive shear across much of the basin throughout the year.',
            'The core 8-24 N typhoon-development belt now uses substantially lower background shear, with the strongest reduction from June through September.',
            'Peak-season WPac shear can now fall to roughly 55-60% of the stock magnitude across the western warm pool and Philippine Sea instead of only receiving a small 10-20% reduction.',
            'Winter remains relatively more hostile than summer but no longer receives an artificial increase above stock shear.',
            'Deep-tropical shear is reduced more consistently, while the correction fades north of roughly 30-35 N so subtropical-jet and recurvature environments can remain hostile.',
            'The correction tapers eastward toward the dateline/eastern map edge rather than applying a uniform basin-wide reduction.',
            'Only shear-vector magnitude is adjusted; low-level and upper-level steering vectors, storm tracks, shear direction, and procedural trough/jet pockets remain unchanged.',
            'Other basin maps are unchanged; Calm mode continues to inherit the tuned Normal environment before applying its own mode-specific hostility.'
        ]
    };

    const changelog = window.RAPTOR_MOD_CHANGELOG;
    if(Array.isArray(changelog)){
        if(!changelog.some(r=>r && r.build===BUILD)) changelog.push(release);
        const parts = v=>(''+v).split('.').map(n=>parseInt(n,10)||0);
        changelog.sort((a,b)=>{
            const av = parts(a.build);
            const bv = parts(b.build);
            const n = Math.max(av.length,bv.length);
            for(let i=0;i<n;i++){
                const d = (bv[i]||0)-(av[i]||0);
                if(d) return d;
            }
            return 0;
        });
    }

    window.RAPTOR_MOD_BUILD = BUILD;

    // The base release coordinator already normalizes the rest of the UI. Wrap
    // it once more to claim the newest build marker/header after that work runs.
    const previousUIInit = UI.init;
    UI.init = function(){
        previousUIInit.call(UI);

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
    };
})();
