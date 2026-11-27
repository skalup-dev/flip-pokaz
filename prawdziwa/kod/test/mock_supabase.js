// Atrapa Supabase do testów: konta i mieszkania w localStorage, te same zasady dostępu co w bazie
(function(){
  const L = k => JSON.parse(localStorage.getItem(k) || 'null');
  const W = (k,v) => localStorage.setItem(k, JSON.stringify(v));
  const uuid = () => 'u' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const CONFIRM = () => !!L('mock_confirm');
  window.supabase = { createClient(){
    let cbs = [];
    const fire = (ev, s) => setTimeout(() => cbs.forEach(cb => cb(ev, s)), 0);
    const sess = () => { const id = L('mock_session'); const u = (L('mock_users')||[]).find(x => x.id === id); return u ? { user:{ id:u.id, email:u.email } } : null; };
    const err = m => ({ data:{}, error:{ message:m } });
    const auth = {
      onAuthStateChange(cb){ cbs.push(cb); setTimeout(() => {
        if (location.hash.includes('type=recovery') && sess()) { cb('PASSWORD_RECOVERY', sess()); } else cb('INITIAL_SESSION', sess());
      }, 0); return { data:{ subscription:{ unsubscribe(){} } } }; },
      async signInWithPassword({email,password}){
        const u = (L('mock_users')||[]).find(x => x.email === email && x.password === password);
        if (!u) return err('Invalid login credentials');
        if (!u.confirmed) return err('Email not confirmed');
        W('mock_session', u.id); fire('SIGNED_IN', sess()); return { data:{ session:sess() }, error:null };
      },
      async signUp({email,password,options}){
        const us = L('mock_users')||[];
        if (us.find(x => x.email === email)) return err('User already registered');
        if (password.length < 6) return err('Password should be at least 6 characters');
        const u = { id:uuid(), email, password, imie:options?.data?.imie, confirmed: !CONFIRM() };
        us.push(u); W('mock_users', us);
        if (u.confirmed){ W('mock_session', u.id); fire('SIGNED_IN', sess()); return { data:{ session:sess() }, error:null }; }
        return { data:{ session:null, user:{ id:u.id } }, error:null };
      },
      async signOut(){ localStorage.removeItem('mock_session'); fire('SIGNED_OUT', null); return { error:null }; },
      async resetPasswordForEmail(email){ W('mock_reset', email); return { data:{}, error:null }; },
      async updateUser({password}){ const s = sess(); if (!s) return err('not logged'); const us = L('mock_users'); us.find(x => x.id === s.user.id).password = password; W('mock_users', us); fire('USER_UPDATED', s); return { data:{ user:s.user }, error:null }; }
    };
    function from(t){
      const q = { op:'select', filt:[], one:false, sel:false, val:null };
      const b = {
        select(){ if (q.op === 'select') q.op = 'select'; q.sel = true; return b; },
        insert(v){ q.op = 'insert'; q.val = v; return b; },
        update(v){ q.op = 'update'; q.val = v; return b; },
        delete(){ q.op = 'delete'; return b; },
        eq(c,v){ q.filt.push([c,v]); return b; },
        in(c,vs){ q.inn = q.inn || []; q.inn.push([c,vs]); return b; },
        order(){ return b; },
        single(){ q.one = true; return b; },
        then(res, rej){ return run().then(res, rej); }
      };
      async function run(){
        if (L('mock_offline')) return { data:null, error:{ message:'Failed to fetch' } };
        const s = sess(); if (!s) return { data:null, error:{ message:'permission denied for table ' + t } };
        let all = L('mock_' + t) || [];
        const mine = r => r.wlasciciel === s.user.id && q.filt.every(([c,v]) => r[c] === v) && (q.inn||[]).every(([c,vs]) => vs.includes(r[c]));
        if (q.op === 'select') return { data: all.filter(mine), error:null };
        if (q.op === 'insert'){
          const v = q.val;
          if (!v.ulica || !v.ulica.trim()) return { data:null, error:{ message:'violates check constraint "mieszkania_ulica_check"' } };
          const r = { id:uuid(), wlasciciel:s.user.id, utworzono:new Date().toISOString(), ...v };
          all.push(r); W('mock_' + t, all); return { data: q.one ? r : [r], error:null };
        }
        if (q.op === 'update'){
          const rows = all.filter(mine); rows.forEach(r => Object.assign(r, q.val)); W('mock_' + t, all);
          if (q.one && rows.length !== 1) return { data:null, error:{ message:'JSON object requested, multiple (or no) rows returned' } };
          return { data: q.one ? rows[0] : rows, error:null };
        }
        if (q.op === 'delete'){ W('mock_' + t, all.filter(r => !mine(r))); return { data:null, error:null }; }
      }
      return b;
    }
    return { auth, from, rpc: async () => ({ data:[], error:null }) };
  } };
})();
