const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Starting server...');
  const server = spawn('npm', ['run', 'dev'], {
    cwd: path.resolve(__dirname, '..'),
    shell: true,
    stdio: 'ignore' 
  });
  
  // Wait for server to be ready
  await new Promise(r => setTimeout(r, 5000));

  const browser = await chromium.launch();

  const viewports = [
    { name: 'Desktop', width: 1920, height: 1080 },
    { name: 'Mobile', ...devices['iPhone 13'] }
  ];



  function outFile(vpName, name) {
    return path.join(__dirname, '..', 'mockups', `${vpName.toLowerCase()}_${name}.png`);
  }

  // --- MOCK DATA ---
  const mockData = {
    user: { id: 'mock-user', email: 'demo@wisebudget.com' },
    // Types
    transaction_types: [
        { id: 1, code: 'INCOME', name_pt: 'Receita' },
        { id: 2, code: 'EXPENSE', name_pt: 'Despesa' },
        { id: 3, code: 'SAVINGS', name_pt: 'Poupança' }
    ],
    // Categories
    categories: [
        { id: 10, name: 'Casa', parent_id: null },
        { id: 11, name: 'Renda', parent_id: 10 },
        { id: 12, name: 'Luz', parent_id: 10 },
        { id: 13, name: 'Internet', parent_id: 10 },
        { id: 20, name: 'Alimentação', parent_id: null },
        { id: 21, name: 'Supermercado', parent_id: 20 },
        { id: 22, name: 'Restaurante', parent_id: 20 },
        { id: 30, name: 'Salário', parent_id: null },
        { id: 99, name: 'Outros', parent_id: null }
    ],
    // Accounts
    accounts: [
        { id: 1, name: 'Banco A' },
        { id: 2, name: 'Carteira' }
    ],
    // Statuses
    statuses: [
        { id: 1, name_pt: 'Concluído' },
        { id: 2, name_pt: 'Pendente' }
    ],
    // Objectives
    objectives: [
        { id: 1, title: 'Limite Supermercado', type: 'budget_cap', monthly_cap: 300, is_active: true, category_id: 21 },
        { id: 2, title: 'Férias Verão', type: 'savings_goal', target_amount: 1500, current_amount: 450, is_active: true }
    ]
  };

  // Generate Transactions
  const now = new Date();
  const txs = [];
  const makeDate = (d) => new Date(now.getFullYear(), now.getMonth(), d).toISOString().split('T')[0];
  const makePrevDate = (mOffset, d) => new Date(now.getFullYear(), now.getMonth() - mOffset, d).toISOString().split('T')[0];

  // --- HISTORICAL DATA GENERATION (Trend Charts) ---
  const histTxs = [];
  for (let i = 1; i <= 12; i++) {
        // Generate random data for past 12 months
        histTxs.push({ id: 1000+i, date: makePrevDate(i, 5), amount: 1500 + (Math.random()*500), type_id: 1, category_id: 30, description: `Salário Mês -${i}`, status_id: 1 });
        histTxs.push({ id: 2000+i, date: makePrevDate(i, 10), amount: 400 + (Math.random()*50), type_id: 2, category_id: 21, description: `Supermercado -${i}`, status_id: 1 });
        histTxs.push({ id: 2100+i, date: makePrevDate(i, 15), amount: 850, type_id: 2, category_id: 11, description: `Renda -${i}`, status_id: 1 });
        histTxs.push({ id: 3000+i, date: makePrevDate(i, 20), amount: 200, type_id: 3, code: 'SAVINGS', category_id: null, description: `Poupança -${i}`, status_id: 1 });
  }
  mockData.transactions = [...txs, ...histTxs];

  // Update Scenarios
  const scenarios = [
    { 
      path: '#/', 
      name: 'dashboard', 
      actions: async (page, vpName) => {
        await page.screenshot({ path: outFile(vpName, 'dashboard') });
      }
    },
    { 
      path: '#/', 
      name: 'dashboard_charts', 
      actions: async (page, vpName) => {
          // Scroll to bottom to see charts
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(500); // Wait for scroll/lazy load
          await page.screenshot({ path: outFile(vpName, 'dashboard_charts') }); // Keep this extra one
      }
    },
    { 
      path: '#/transactions', 
      name: 'movimentos', // Matches Movimentos.html
      actions: async (page, vpName) => {
        await page.screenshot({ path: outFile(vpName, 'movimentos') });
      }
    },
    { 
      path: '#/new', 
      name: 'nova', // Matches nova.html
      actions: async (page, vpName) => {
        await page.fill('#tx-amount', '45.50');
        await page.fill('#tx-desc', 'Jantar com amigos');
        await page.screenshot({ path: outFile(vpName, 'nova') });
      }
    },
    { 
      path: '#/metas', 
      name: 'metas', // Matches Metas.html
      actions: async (page, vpName) => {
        await page.screenshot({ path: outFile(vpName, 'metas') });
      }
    },
    { 
      path: '#/settings', 
      name: 'settings', // Matches settings.html
      actions: async (page, vpName) => {
        await page.screenshot({ path: outFile(vpName, 'settings') });
        
        if (vpName === 'Desktop') {
             const reportSection = await page.$('text="Relatórios"');
             if (reportSection) {
                 await reportSection.scrollIntoViewIfNeeded();
                 await page.waitForTimeout(300);
                 await page.screenshot({ path: outFile(vpName, 'settings_reports') });
             }
        }
      }
    },
    {
       path: '#/categories',
       name: 'categories',
       actions: async (page, vpName) => {
         await page.screenshot({ path: outFile(vpName, 'categories') });
       }
    }
  ];
  for (const viewport of viewports) {
    console.log(`Processing ${viewport.name}...`);
    const context = await browser.newContext(
       viewport.name === 'Mobile' ? viewport : { viewport }
    );
    
    // Inject Mock via 'supabase' global to intercept the real client creation in index.html
    await context.addInitScript((data) => {
        // We define 'supabase' object that index.html expects from the CDN
        window.supabase = {
            createClient: (url, key) => {
                console.log("MOCKED createClient called!");
                return {
                    auth: {
                        getSession: async () => ({ data: { session: { user: data.user } } }),
                        onAuthStateChange: (cb) => {
                            setTimeout(() => cb('SIGNED_IN', { user: data.user }), 50);
                            return { data: { subscription: { unsubscribe: () => {} } } };
                        },
                        resetPasswordForEmail: async () => ({ error: null }),
                        signOut: async () => ({ error: null }),
                    },
                    from: (table) => {
                        const db = data[table] || [];
                        let currentResult = [...db];
                        let error = null;

                        const chain = {
                            select: (cols) => { 
                                if(table === 'transactions') {
                                    currentResult = currentResult.map(t => {
                                        const type = data.transaction_types.find(x => x.id === t.type_id);
                                        const cat = data.categories.find(x => x.id === t.category_id);
                                        const acc = data.accounts.find(x => x.id === t.account_id);
                                        const st = data.statuses.find(x => x.id === t.status_id);
                                        return { ...t, transaction_types: type, categories: cat, accounts: acc, statuses: st };
                                    });
                                }
                                return chain; 
                            },
                            eq: (col, val) => { currentResult = currentResult.filter(r => r[col] == val); return chain; },
                            neq: (col, val) => { currentResult = currentResult.filter(r => r[col] != val); return chain; },
                            gt: (col, val) => { currentResult = currentResult.filter(r => r[col] > val); return chain; },
                            gte: (col, val) => { currentResult = currentResult.filter(r => r[col] >= val); return chain; },
                            lt: (col, val) => { currentResult = currentResult.filter(r => r[col] < val); return chain; },
                            lte: (col, val) => { currentResult = currentResult.filter(r => r[col] <= val); return chain; },
                            in: (col, arr) => { currentResult = currentResult.filter(r => arr.includes(r[col])); return chain; },
                            order: (col, { ascending = true } = {}) => {
                                 currentResult.sort((a,b) => (a[col] < b[col] ? (ascending?-1:1) : (a[col]>b[col]?(ascending?1:-1):0)));
                                 return chain;
                            },
                            range: (from, to) => { currentResult = currentResult.slice(from, to + 1); return chain; },
                            single: async () => ({ data: currentResult[0] || null, error: null }),
                            maybeSingle: async () => ({ data: currentResult[0] || null, error: null }),
                            delete: () => chain,
                            update: () => chain,
                            insert: () => chain,
                            then: (resolve) => resolve({ data: currentResult, error })
                        };
                        return chain;
                    },
                    rpc: async (name, args) => ({ data: [], error: null })
                };
            }
        };
    }, mockData);

    const page = await context.newPage();
    
    // Block real Supabase CDN to ensure our mock isn't overwritten by the library loading
    await page.route('**/*supabase-js*', route => route.abort());

    for (const scenario of scenarios) {
        const url = `http://127.0.0.1:5500/index.html${scenario.path}`;
        try {
            console.log(`Navigating to ${scenario.name} (${viewport.name})...`);
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            
            // Brute force hide splash
            await page.addStyleTag({ content: '#wb-splash { display: none !important; }' });

            // Generous wait for everything to settle
            await page.waitForTimeout(5000);

            // Screenshot
            await scenario.actions(page, viewport.name);
            console.log(`Captured ${scenario.name}`);
        } catch (err) {
            console.error(`FAILED ${scenario.name}:`, err.message);
            try {
                await page.screenshot({ path: outFile(viewport.name, `ERROR_${scenario.name}`) });
            } catch {}
        }
    }
    await context.close();
  }

  await browser.close();
  server.kill();
  process.exit(0);
})();
