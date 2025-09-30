// Cache + fetch + eventos para categorias (por utilizador + globais)
export function normalizeKey(s = "") {
  return s.toLocaleLowerCase("pt-PT")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
}

let _cache = null;
let _pending = null;

export async function fetchCategoryTree(sb) {
  if (_cache) return _cache;
  if (_pending) return _pending;

  _pending = (async () => {
    const { data: { user } } = await sb.auth.getUser();

    // vês as tuas categorias e as globais (user_id IS NULL)
    const { data, error } = await sb
      .from("categories")
      .select("id,name,parent_id,kind,nature,user_id")
      .or(`user_id.eq.${user.id},user_id.is.null`);

    if (error) throw error;
    const all = data || [];

    const parentsAll = all.filter(c => !c.parent_id);
    const children   = all.filter(c =>  c.parent_id);

    // agrupar pais por nome (global + do utilizador)
    const groups = new Map(); // key -> [pais]
    parentsAll.forEach(p => {
      const k = normalizeKey(p.name);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });

    // 1 representante por nome para o 1º dropdown
    const parents = [];
    const idsByKey = new Map(); // "casa" -> [ids... de pais com esse nome]
    groups.forEach((arr, k) => {
      parents.push({ id: arr[0].id, name: arr[0].name });
      idsByKey.set(k, arr.map(x => x.id));
    });

    // natureza “default” por id (útil na criação de despesa)
    const defaultNature = new Map(all.map(c => [c.id, c.nature || null]));

    _cache = { parents, children, idsByKey, defaultNature };
    _pending = null;
    return _cache;
  })();

  return _pending;
}

export function onCategoriesChanged() {
  _cache = null;                       // invalida cache
  window.dispatchEvent(new Event("categories:changed"));
}
