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
        us.push(u); W('mock_users', us); const pr = L('mock_profile')||[]; pr.push({ id:u.id, imie:options?.data?.imie||null, rola:'wlasciciel', nazwa_firmy:null }); W('mock_profile', pr);
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
        like(c,v){ const re = new RegExp('^'+v.replace(/%/g,'.*')+'$'); q.lk = q.lk || []; q.lk.push([c,re]); return b; },
        order(){ return b; },
        single(){ q.one = true; return b; },
        then(res, rej){ return run().then(res, rej); }
      };
      async function run(){
        if (L('mock_offline')) return { data:null, error:{ message:'Failed to fetch' } };
        const s = sess(); if (!s) return { data:null, error:{ message:'permission denied for table ' + t } };
        let all = L('mock_' + t) || [];
        const mine = r => (t === 'profile' ? r.id === s.user.id : r.wlasciciel === s.user.id) && q.filt.every(([c,v]) => r[c] === v) && (q.inn||[]).every(([c,vs]) => vs.includes(r[c])) && (q.lk||[]).every(([c,re]) => re.test(r[c]||''));
        if (q.op === 'select') return { data: all.filter(mine), error:null };
        if (q.op === 'insert'){
          const vs = Array.isArray(q.val) ? q.val : [q.val];
          if (t === 'mieszkania' && vs.some(v => !v.ulica || !v.ulica.trim())) return { data:null, error:{ message:'violates check constraint "mieszkania_ulica_check"' } };
          const rows = vs.map(v => ({ id:uuid(), wlasciciel:s.user.id, utworzono:new Date().toISOString(), ...(t === 'pliki' ? { dodal:s.user.id } : {}), ...(t === 'prace' ? { zrobiona:false } : {}), ...v }));
          all.push(...rows); W('mock_' + t, all); return { data: q.one ? rows[0] : rows, error:null };
        }
        if (q.op === 'update'){
          const rows = all.filter(mine);
          if (t === 'prace' && 'zrobiona' in q.val){
            if (q.val.zrobiona && rows.some(r => !r.zrobiona && !(L('mock_pliki')||[]).some(z => z.praca === r.id))) return { data:null, error:{ message:'Najpierw trzeba dodać co najmniej jedno zdjęcie' } };
            rows.forEach(r => { if (q.val.zrobiona && !r.zrobiona){ r.zrobiona_przez = s.user.id; r.zrobiona_kiedy = new Date().toISOString(); } if (!q.val.zrobiona){ r.zrobiona_przez = null; r.zrobiona_kiedy = null; } });
          }
          rows.forEach(r => Object.assign(r, q.val)); W('mock_' + t, all);
          if (q.one && rows.length !== 1) return { data:null, error:{ message:'JSON object requested, multiple (or no) rows returned' } };
          return { data: q.one ? rows[0] : rows, error:null };
        }
        if (q.op === 'delete'){
          if (t === 'pliki'){ const pr = L('mock_prace') || []; const usuwane = all.filter(mine);
            for (const f of usuwane){ if (f.praca && pr.some(x => x.id === f.praca && x.zrobiona) && !all.some(g => g.praca === f.praca && !usuwane.includes(g))) return { data:null, error:{ message:'To ostatnie zdjęcie zrobionej pracy. Najpierw trzeba odznaczyć pracę' } }; } } W('mock_' + t, all.filter(r => !mine(r))); return { data:null, error:null }; }
      }
      return b;
    }
    const storage = { from(){ return {
      async upload(p, blob){ if (L('mock_offline')) return {error:{message:'Failed to fetch'}}; window.__pl = window.__pl || {}; window.__pl[p] = URL.createObjectURL(blob); return { data:{path:p}, error:null }; },
      async remove(ps){ ps.forEach(p => { if (window.__pl) delete window.__pl[p]; }); return { data:[], error:null }; },
      async createSignedUrls(ps){ return { data: ps.map(p => ({ path:p, signedUrl:(window.__pl||{})[p] || null })), error:null }; } }; } };
    const rpc = async (nazwa, a) => { const s = sess(); const pr = L('mock_profile') || []; return { data:(a.ids||[]).filter(id => s && id === s.user.id).map(id => { const p = pr.find(x => x.id === id); return { id, nazwa:(p && p.imie) || 'Właściciel aplikacji' }; }), error:null }; };
    return { auth, from, storage, rpc };
  } };
})();
