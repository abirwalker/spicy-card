Didn't log this version. Too busy fixing lyrics getting chopped on some songs (mainly non-English/romanized ones). 

Culprits were `white-space: nowrap` on `.Syllable/.Word`, multiple `overflow: hidden` constraints, missing ResizeObserver, and various width/max-width limits. Who knew.?