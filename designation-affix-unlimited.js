// Tiny UI hotfix: designation-system Prefix and Suffix inputs should not have
// a character limit. Intentionally unversioned and omitted from the changelog.
(function(){
    const originalAppend = UI.prototype.append;

    UI.prototype.append = function(chain,...opts){
        const renderer = opts[4];

        // Stock creates both affix inputs as [18, 6, enterFunc]. Identify them
        // by their own save callback rather than by the parent label renderer.
        // This keeps every unrelated six-character input unchanged.
        if(Array.isArray(renderer) && renderer[1]===6 && renderer[2] instanceof Function){
            const src = renderer[2].toString();
            if(src.includes('numbering.prefix') || src.includes('numbering.suffix')){
                opts[4] = [renderer[0], undefined, renderer[2]];
            }
        }

        return originalAppend.call(this,chain,...opts);
    };
})();
