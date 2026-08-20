// Raptor Mod build marker + in-game changelog.
// Keep this build string and changelog updated with future mod releases so the
// main menu immediately shows whether GitHub Pages served the newest version.
(function(){
    const RAPTOR_MOD_BUILD = '0.5.0';
    const RAPTOR_MOD_DATE = '21 Aug 2026';

    const CHANGELOG = [
        {
            build: '0.5.0',
            date: '21 Aug 2026',
            changes: [
                'Improved warm-core L / tropical-remnant regeneration over favorable warm water.',
                'Added a gentler organization^2 recovery path for remnants without changing active-TC intensification.',
                'Added an 18-hour timeout for 1020+ hPa, sub-20 kt, nearly unorganized lows.',
                'Weak-low timeout resets when a remnant reaches genuinely favorable recovery conditions.'
            ]
        },
        {
            build: '0.4.0',
            date: '20 Aug 2026',
            changes: [
                'Added visible Raptor Mod build number to the main menu.',
                'Added this in-game changelog screen for easy update checking.'
            ]
        },
        {
            build: '0.3.0',
            date: '20 Aug 2026',
            changes: [
                'Retuned Normal-mode Western Pacific sea surface temperatures.',
                'Reduced WPac SST anomaly amplitude by 30%.',
                'Added a warmer tropical pool and summer/fall Kuroshio warm tongue.'
            ]
        },
        {
            build: '0.2.0',
            date: '20 Aug 2026',
            changes: [
                'Added responsive 16:9 browser scaling and reliable canvas centering.',
                'Added stylesheet cache-busting to make Pages updates easier to verify.'
            ]
        },
        {
            build: '0.1.0',
            date: '20 Aug 2026',
            changes: [
                'Added Natural Storm Spawning toggle below God Mode.',
                'Manual God Mode storm spawning remains available when natural spawning is disabled.'
            ]
        }
    ];

    // Expose build metadata for quick debugging from the browser console too.
    window.RAPTOR_MOD_BUILD = RAPTOR_MOD_BUILD;
    window.RAPTOR_MOD_CHANGELOG = CHANGELOG;

    const originalUIInit = UI.init;
    UI.init = function(){
        originalUIInit.call(UI);

        const changelogMenu = new UI(null,0,0,WIDTH,HEIGHT,undefined,undefined,false);

        // Always-visible build marker on the main menu.
        mainMenu.append(false,WIDTH/2,HEIGHT/4+76,0,0,function(){
            fill(COLORS.UI.text);
            noStroke();
            textAlign(CENTER,CENTER);
            textStyle(NORMAL);
            textSize(14);
            text('Raptor Mod build ' + RAPTOR_MOD_BUILD + '  |  Base v' + VERSION_NUMBER,0,0);
        });

        // Locate the existing New Basin -> Load Basin -> Settings button chain.
        const newBasinButton = mainMenu.children.find(u=>
            u.width === 200 && u.height === 40 && u.relX === WIDTH/2-100
        );
        const loadButton = newBasinButton && newBasinButton.children.find(u=>
            u.width === 200 && u.height === 40 && u.relY === 60
        );
        const settingsButton = loadButton && loadButton.children.find(u=>
            u.width === 200 && u.height === 40 && u.relY === 60
        );

        if(settingsButton){
            settingsButton.append(false,0,60,200,40,function(s){
                s.button('Changelog',true,24);
            },function(){
                mainMenu.hide();
                changelogMenu.show();
            });
        }else{
            console.warn('Raptor Mod changelog: could not locate Settings button');
        }

        changelogMenu.append(false,WIDTH/2,52,0,0,function(){
            fill(COLORS.UI.text);
            noStroke();
            textAlign(CENTER,CENTER);
            textStyle(NORMAL);
            textSize(34);
            text('Raptor Mod Changelog',0,0);
            textSize(15);
            text('Current build: ' + RAPTOR_MOD_BUILD + '  |  ' + RAPTOR_MOD_DATE + '  |  Base v' + VERSION_NUMBER,0,34);
        });

        changelogMenu.append(false,100,112,WIDTH-200,330,function(){
            fill(COLORS.UI.text);
            noStroke();
            textAlign(LEFT,TOP);
            textStyle(NORMAL);

            let y = 0;
            for(let release of CHANGELOG){
                textSize(18);
                textStyle(BOLD);
                text('Build ' + release.build + '  -  ' + release.date,0,y);
                y += 24;

                textSize(14);
                textStyle(NORMAL);
                for(let change of release.changes){
                    text('• ' + change,12,y);
                    y += 20;
                }
                y += 12;
            }
        });

        changelogMenu.append(false,WIDTH/2-100,HEIGHT-66,200,40,function(s){
            s.button('Back',true,24);
        },function(){
            changelogMenu.hide();
            mainMenu.show();
        });
    };
})();
