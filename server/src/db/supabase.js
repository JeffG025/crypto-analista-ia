const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

// Si no hay credenciales, los repos usan almacenamiento en memoria (modo dev)
const enabled = Boolean(url && key && !url.includes('TU_SUPABASE'));

const supabase = enabled ? createClient(url, key, { auth: { persistSession: false } }) : null;

if (enabled) {
    console.log('🗄️  Supabase conectado — datos persistentes');
} else {
    console.warn('⚠️  Supabase NO configurado — usando memoria (los datos se pierden al reiniciar). Ver server/schema.sql');
}

module.exports = { supabase, enabled };
