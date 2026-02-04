// src/lib/categories-crud.js
// CRUD de categorias (globais: user_id=null; do utilizador: user_id=auth.uid())
// Requer window.sb criado no index.html

export const Categories = (() => {
  const sb = window.sb;
  if (!sb) throw new Error("Supabase client não inicializado (window.sb).");

  async function currentUserId() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error("Precisas de iniciar sessão.");
    return user.id;
  }

  async function listAll() {
    const uid = await currentUserId();
    const { data, error } = await sb
      .from("categories")
      .select("id,name,kind,parent_id,user_id,created_at")
      .or(`user_id.is.null,user_id.eq.${uid}`)
      .order("name", { ascending: true });
    if (error) throw error;

    const parents = new Map((data||[]).filter(c=>!c.parent_id).map(p=>[p.id,p.name]));
    const rows = (data||[]).map(c => ({
      ...c,
      isSystem: c.user_id === null,
      path: c.parent_id ? `${parents.get(c.parent_id) || "?"} > ${c.name}` : c.name
    }));
    return {
      all: rows,
      parents: rows.filter(c => !c.parent_id),
      children: rows.filter(c =>  c.parent_id),
    };
  }

  async function create({ name, kind, parent_id = null }) {
    const uid = await currentUserId();
    const payload = {
      user_id: uid,
      name: String(name||"").trim(),
      kind: kind || "expense",
      parent_id: parent_id || null
    };
    if (!payload.name) throw new Error("Nome obrigatório.");
    if (!["income","expense","savings","transfer"].includes(payload.kind)) {
      throw new Error("Tipo inválido.");
    }
    const { data, error } = await sb.from("categories").insert([payload]).select().single();
    if (error) {
      if ((error.code||"").toString() === "23505")
        throw new Error("Já existe uma categoria com esse nome no mesmo nível.");
      throw error;
    }
    return data;
  }

  async function update(id, { name, kind, parent_id = null }) {
    const uid = await currentUserId();
    const patch = {};
    if (name != null) patch.name = String(name).trim();
    if (kind != null) patch.kind = kind;
    if (parent_id !== undefined) patch.parent_id = parent_id;

    const { data, error } = await sb.from("categories")
      .update(patch).eq("id", id).eq("user_id", uid).select().maybeSingle();
    if (error) {
      if ((error.code||"").toString() === "23505")
        throw new Error("Já existe uma categoria com esse nome no mesmo nível.");
      throw error;
    }
    if (!data) throw new Error("Não podes editar categorias de sistema.");
    return data;
  }

  async function remove(id) {
    const uid = await currentUserId();
    const { error, count } = await sb.from("categories")
      .delete({ count:"exact" })
      .eq("id", id).eq("user_id", uid);
    if (error) {
      if ((error.code||"").toString() === "23503")
        throw new Error("Não é possível apagar: existem transações associadas.");
      throw error;
    }
    if (!count) throw new Error("Categoria não encontrada ou sem permissão.");
    return true;
  }

  return { listAll, create, update, remove };
})();
