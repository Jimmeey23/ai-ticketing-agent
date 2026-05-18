import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://hdtyjkcorrgzoxshalkb.databasepad.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjNmZjFjZWI2LTUwODgtNDY5MC04NDQzLWIzYTVmYjQzNzAxNyJ9.eyJwcm9qZWN0SWQiOiJoZHR5amtjb3JyZ3pveHNoYWxrYiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc4ODIyNTAwLCJleHAiOjIwOTQxODI1MDAsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.EexocF_GF9qaq0j3r-sHCHd-2QtUGGOWWNeJV_3B4nU';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };