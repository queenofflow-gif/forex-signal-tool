#!/bin/sh
# The website and the server share one strategy engine. Run after editing src/engine/engine.js.
cp src/engine/engine.js supabase/functions/_shared/engine.js
