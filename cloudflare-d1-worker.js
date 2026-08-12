export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin") || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": requestOrigin,
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Credentials": "true",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const ensureClientIdColumn = async () => {
      try {
        await env.DB.prepare("ALTER TABLE transactions ADD COLUMN clientId TEXT").run();
      } catch (_) {
        // Column already exists or table has not been created yet.
      }
      try {
        await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_client_id ON transactions(clientId)").run();
      } catch (_) {
        // Ignore index creation failures for older schemas with duplicate client IDs.
      }
    };

    try {
      if (request.method === 'GET') {
        if (action === 'test') {
          return new Response('OK', { headers: corsHeaders });
        }

        if (action === 'getAll') {
          const limitParam = parseInt(searchParams.get('limit') || '5000');
          const fetchAll = limitParam <= 0;
          const { results } = fetchAll
            ? await env.DB.prepare("SELECT * FROM transactions ORDER BY id DESC").all()
            : await env.DB.prepare("SELECT * FROM transactions ORDER BY id DESC LIMIT ?").bind(limitParam).all();
          return new Response(JSON.stringify({ transactions: results, timestamp: Date.now() }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (action === 'getNew') {
          const lastId = parseInt(searchParams.get('lastId') || '0');
          const { results } = await env.DB.prepare("SELECT * FROM transactions WHERE id > ? ORDER BY id ASC").bind(lastId).all();
          return new Response(JSON.stringify({ transactions: results }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (action === 'getLastId') {
          const result = await env.DB.prepare("SELECT MAX(id) as lastId FROM transactions").first();
          return new Response(JSON.stringify({ lastId: result ? result.lastId : 0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      if (request.method === 'POST') {
        const data = await request.json();
        const postAction = data.action;

        if (postAction === 'initialize') {
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS transactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              clientId TEXT,
              date TEXT,
              type TEXT,
              paymentMethod TEXT,
              company TEXT,
              person TEXT,
              location TEXT,
              recordedBy TEXT,
              amount REAL,
              notes TEXT,
              breakdown TEXT,
              bank TEXT,
              slip TEXT
            )
          `).run();
          await ensureClientIdColumn();
          // Performance indexes: faster getNew and getAll queries
          try {
            await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_id ON transactions(id DESC)").run();
            await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC)").run();
          } catch (_) { /* ignore if already exists */ }
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // --- NEW DATABASE REPAIR ACTION ---
        if (postAction === 'repair') {
          console.log('👷 Rebuilding and Deduplicating database...');
          
          try {
            await env.DB.prepare("ALTER TABLE transactions RENAME TO transactions_old").run();
          } catch (e) {
            return new Response(JSON.stringify({ success: false, error: "Repair failed or table missing" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          await env.DB.prepare(`
            CREATE TABLE transactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              clientId TEXT,
              date TEXT,
              type TEXT,
              paymentMethod TEXT,
              company TEXT,
              person TEXT,
              location TEXT,
              recordedBy TEXT,
              amount REAL,
              notes TEXT,
              breakdown TEXT,
              bank TEXT,
              slip TEXT
            )
          `).run();

          // DEDUPLICATION: Group by everything that makes a transaction unique
          // We take the MAX(rowid) to keep at least one copy
          await env.DB.prepare(`
            INSERT INTO transactions (clientId, date, type, paymentMethod, company, person, location, recordedBy, amount, notes, breakdown, bank, slip)
            SELECT MAX(clientId), date, type, paymentMethod, company, person, location, recordedBy, amount, notes, breakdown, bank, slip 
            FROM transactions_old
            GROUP BY date, amount, person, type, company, notes
            ORDER BY date ASC
          `).run();

          await env.DB.prepare("DROP TABLE transactions_old").run();

          return new Response(JSON.stringify({ success: true, message: "Database repaired and duplicates removed!" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (postAction === 'add') {
          await ensureClientIdColumn();
          const { clientId, date, type, paymentMethod, company, person, location, recordedBy, amount, notes, breakdown, bank, slip } = data.data;

          if (clientId) {
            const existing = await env.DB.prepare("SELECT id FROM transactions WHERE clientId = ?").bind(clientId).first();
            if (existing?.id) {
              return new Response(JSON.stringify({ success: true, id: existing.id, duplicate: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
          }
          
          // ID is generated by SQLite (Auto-increment)
          const insertResult = await env.DB.prepare(`
            INSERT INTO transactions (clientId, date, type, paymentMethod, company, person, location, recordedBy, amount, notes, breakdown, bank, slip)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
          `).bind(clientId || null, date, type, paymentMethod, company || '', person || '', location || '', recordedBy || '', amount || 0, notes || '', breakdown || '{}', bank || '', slip || '').first();

          return new Response(JSON.stringify({ success: true, id: insertResult ? insertResult.id : null }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (postAction === 'update') {
          const { id, date, type, paymentMethod, company, person, location, recordedBy, amount, notes, breakdown, bank, slip } = data.data;
          const updateResult = await env.DB.prepare(`
            UPDATE transactions SET 
              date = ?, type = ?, paymentMethod = ?, company = ?, person = ?, 
              location = ?, recordedBy = ?, amount = ?, notes = ?, breakdown = ?,
              bank = ?, slip = ?
            WHERE id = ?
          `).bind(
            date || new Date().toISOString(),
            type || '',
            paymentMethod || '',
            company || '',
            person || '',
            location || '',
            recordedBy || '',
            amount || 0,
            notes || '',
            breakdown || '{}',
            bank || '',
            slip || '',
            id
          ).run();

          const changes = updateResult?.meta?.changes || 0;
          if (changes === 0) {
            return new Response(JSON.stringify({ success: false, error: "Transaction not found", changes }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          return new Response(JSON.stringify({ success: true, changes }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (postAction === 'delete') {
          const { id } = data;
          let deleteResult;
          if (id === null || id === 'null') {
             deleteResult = await env.DB.prepare("DELETE FROM transactions WHERE id IS NULL").run();
          } else {
             deleteResult = await env.DB.prepare("DELETE FROM transactions WHERE id = ?").bind(id).run();
          }
          // ✅ FIX: Actual changes check karo — agar row exist nahi thi toh bhi success false return karo
          const deleted = (deleteResult?.meta?.changes || 0) > 0;
          return new Response(JSON.stringify({ success: deleted }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Worker Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
