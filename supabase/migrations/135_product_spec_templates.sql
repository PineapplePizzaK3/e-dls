-- Fichas técnicas modulares por template para produtos da loja.

CREATE TABLE IF NOT EXISTS public.product_spec_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_spec_templates_created_at
  ON public.product_spec_templates(created_at DESC);

ALTER TABLE public.product_spec_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage product spec templates"
  ON public.product_spec_templates;
CREATE POLICY "Admins can manage product spec templates"
  ON public.product_spec_templates
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS spec_template_id uuid NULL REFERENCES public.product_spec_templates(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS technical_specs jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_technical_specs_object_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_technical_specs_object_check
  CHECK (jsonb_typeof(technical_specs) = 'object');

CREATE OR REPLACE FUNCTION public.admin_list_product_spec_templates(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 200), 1), 1000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
    FROM (
      SELECT
        pst.*,
        p.name AS created_by_name,
        p.email AS created_by_email
      FROM public.product_spec_templates pst
      LEFT JOIN public.profiles p ON p.id = pst.created_by
      ORDER BY pst.created_at DESC
      LIMIT v_limit
      OFFSET v_offset
    ) t
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_product_spec_template(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_category text;
  v_fields jsonb;
  v_row public.product_spec_templates%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_name := NULLIF(trim(COALESCE(p_payload->>'name', '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Nome do template é obrigatório';
  END IF;

  v_category := NULLIF(trim(COALESCE(p_payload->>'category', '')), '');
  v_fields := COALESCE(p_payload->'fields', '[]'::jsonb);

  IF jsonb_typeof(v_fields) <> 'array' THEN
    RAISE EXCEPTION 'Campos do template inválidos';
  END IF;

  INSERT INTO public.product_spec_templates (
    name,
    category,
    fields,
    created_by
  ) VALUES (
    v_name,
    v_category,
    v_fields,
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN row_to_json(v_row)::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_product_spec_template(
  p_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.product_spec_templates%ROWTYPE;
  v_name text;
  v_category text;
  v_fields jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO v_row
  FROM public.product_spec_templates
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template não encontrado';
  END IF;

  v_name := COALESCE(NULLIF(trim(COALESCE(p_payload->>'name', '')), ''), v_row.name);
  v_category := CASE
    WHEN p_payload ? 'category' THEN NULLIF(trim(COALESCE(p_payload->>'category', '')), '')
    ELSE v_row.category
  END;
  v_fields := CASE
    WHEN p_payload ? 'fields' THEN COALESCE(p_payload->'fields', '[]'::jsonb)
    ELSE v_row.fields
  END;

  IF jsonb_typeof(v_fields) <> 'array' THEN
    RAISE EXCEPTION 'Campos do template inválidos';
  END IF;

  UPDATE public.product_spec_templates
  SET
    name = v_name,
    category = v_category,
    fields = v_fields,
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN row_to_json(v_row)::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_product_spec_template(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF EXISTS (SELECT 1 FROM public.products WHERE spec_template_id = p_id) THEN
    RAISE EXCEPTION 'Template em uso por produtos';
  END IF;

  DELETE FROM public.product_spec_templates
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template não encontrado';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_product(p_product jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_img_url text;
  v_img_urls jsonb;
  v_price_jpy numeric;
  v_product_id uuid;
  v_variants jsonb;
  v_spec_template_id uuid;
  v_technical_specs jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_img_url := NULLIF(trim(COALESCE(p_product->>'image_url','')), '')::text;
  v_img_urls := COALESCE(p_product->'image_urls', '[]'::jsonb);
  IF jsonb_typeof(v_img_urls) <> 'array' OR jsonb_array_length(v_img_urls) = 0 THEN
    IF v_img_url IS NOT NULL THEN
      v_img_urls := jsonb_build_array(v_img_url);
    ELSE
      v_img_urls := '[]'::jsonb;
    END IF;
  END IF;

  v_price_jpy := GREATEST(COALESCE((p_product->>'price')::numeric, 0), 0);
  v_spec_template_id := NULLIF(trim(COALESCE(p_product->>'spec_template_id', '')), '')::uuid;
  v_technical_specs := COALESCE(p_product->'technical_specs', '{}'::jsonb);
  IF jsonb_typeof(v_technical_specs) <> 'object' THEN
    v_technical_specs := '{}'::jsonb;
  END IF;

  INSERT INTO public.products (
    name,
    description,
    price,
    price_jpy,
    image_url,
    image_urls,
    is_active,
    weight_kg,
    stock_quantity,
    item_condition,
    category,
    admin_product_url,
    spec_template_id,
    technical_specs
  )
  VALUES (
    (p_product->>'name')::text,
    NULLIF(trim(COALESCE(p_product->>'description','')), '')::text,
    v_price_jpy,
    v_price_jpy,
    v_img_url,
    v_img_urls,
    COALESCE((p_product->>'is_active')::boolean, true),
    COALESCE((p_product->>'weight_kg')::numeric, 0),
    CASE
      WHEN (p_product->>'stock_quantity') IS NULL OR trim(COALESCE(p_product->>'stock_quantity','')) = '' THEN NULL
      ELSE GREATEST((p_product->>'stock_quantity')::integer, 0)
    END,
    NULLIF(trim(COALESCE(p_product->>'item_condition', '')), ''),
    NULLIF(trim(COALESCE(p_product->>'category', '')), ''),
    NULLIF(trim(COALESCE(p_product->>'admin_product_url', '')), ''),
    v_spec_template_id,
    v_technical_specs
  )
  RETURNING id INTO v_product_id;

  v_variants := p_product->'variants';
  IF v_variants IS NOT NULL AND jsonb_typeof(v_variants) = 'array' AND jsonb_array_length(v_variants) > 0 THEN
    PERFORM public.admin_sync_product_variants(v_product_id, v_variants);
  ELSE
    INSERT INTO public.product_variants (product_id, title, attributes, image_url, image_urls, price_jpy, stock_quantity, is_active, is_default)
    VALUES (
      v_product_id,
      'Padrão',
      jsonb_build_object('versao', 'Padrão'),
      v_img_url,
      v_img_urls,
      v_price_jpy,
      CASE
        WHEN (p_product->>'stock_quantity') IS NULL OR trim(COALESCE(p_product->>'stock_quantity','')) = '' THEN NULL
        ELSE GREATEST((p_product->>'stock_quantity')::integer, 0)
      END,
      true,
      true
    );
  END IF;

  SELECT to_jsonb(p.*) || jsonb_build_object(
    'spec_template',
    CASE WHEN pst.id IS NULL THEN NULL ELSE to_jsonb(pst) END,
    'variants',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.is_default DESC, v.created_at ASC)
      FROM public.product_variants v
      WHERE v.product_id = p.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.products p
  LEFT JOIN public.product_spec_templates pst ON pst.id = p.spec_template_id
  WHERE p.id = v_product_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_product(p_id uuid, p_product jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_img_url text;
  v_img_urls jsonb;
  v_price_jpy numeric;
  v_variants jsonb;
  v_spec_template_id uuid;
  v_technical_specs jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_img_url := NULLIF(trim(COALESCE(p_product->>'image_url','')), '')::text;
  v_img_urls := COALESCE(p_product->'image_urls', '[]'::jsonb);
  IF jsonb_typeof(v_img_urls) <> 'array' OR jsonb_array_length(v_img_urls) = 0 THEN
    IF v_img_url IS NOT NULL THEN
      v_img_urls := jsonb_build_array(v_img_url);
    ELSE
      v_img_urls := '[]'::jsonb;
    END IF;
  END IF;

  v_price_jpy := GREATEST(COALESCE((p_product->>'price')::numeric, 0), 0);
  v_spec_template_id := CASE
    WHEN p_product ? 'spec_template_id' THEN NULLIF(trim(COALESCE(p_product->>'spec_template_id', '')), '')::uuid
    ELSE NULL
  END;
  v_technical_specs := COALESCE(p_product->'technical_specs', '{}'::jsonb);
  IF jsonb_typeof(v_technical_specs) <> 'object' THEN
    v_technical_specs := '{}'::jsonb;
  END IF;

  UPDATE public.products
  SET
    name = (p_product->>'name')::text,
    description = NULLIF(trim(COALESCE(p_product->>'description','')), '')::text,
    price = v_price_jpy,
    price_jpy = v_price_jpy,
    image_url = v_img_url,
    image_urls = v_img_urls,
    is_active = COALESCE((p_product->>'is_active')::boolean, true),
    weight_kg = COALESCE((p_product->>'weight_kg')::numeric, 0),
    stock_quantity = CASE
      WHEN p_product ? 'stock_quantity' AND trim(COALESCE(p_product->>'stock_quantity','')) <> '' THEN GREATEST((p_product->>'stock_quantity')::integer, 0)
      WHEN p_product ? 'stock_quantity' THEN NULL
      ELSE stock_quantity
    END,
    item_condition = NULLIF(trim(COALESCE(p_product->>'item_condition', '')), ''),
    category = NULLIF(trim(COALESCE(p_product->>'category', '')), ''),
    admin_product_url = NULLIF(trim(COALESCE(p_product->>'admin_product_url', '')), ''),
    spec_template_id = CASE
      WHEN p_product ? 'spec_template_id' THEN v_spec_template_id
      ELSE spec_template_id
    END,
    technical_specs = CASE
      WHEN p_product ? 'technical_specs' THEN v_technical_specs
      ELSE technical_specs
    END,
    updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  v_variants := p_product->'variants';
  IF v_variants IS NOT NULL AND jsonb_typeof(v_variants) = 'array' AND jsonb_array_length(v_variants) > 0 THEN
    PERFORM public.admin_sync_product_variants(p_id, v_variants);
  END IF;

  SELECT to_jsonb(p.*) || jsonb_build_object(
    'spec_template',
    CASE WHEN pst.id IS NULL THEN NULL ELSE to_jsonb(pst) END,
    'variants',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.is_default DESC, v.created_at ASC)
      FROM public.product_variants v
      WHERE v.product_id = p.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.products p
  LEFT JOIN public.product_spec_templates pst ON pst.id = p.spec_template_id
  WHERE p.id = p_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_store_products(
  p_limit int DEFAULT 500,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 500), 1), 5000);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(x.item), '[]'::jsonb)
    FROM (
      SELECT
        (to_jsonb(pr.*) - 'admin_product_url') || jsonb_build_object(
          'price_jpy', COALESCE(v.min_price_jpy, pr.price_jpy, pr.price, 0),
          'spec_template', CASE WHEN pst.id IS NULL THEN NULL ELSE (to_jsonb(pst) - 'created_by') END,
          'variants', COALESCE(v.variants, '[]'::jsonb)
        ) AS item
      FROM public.store_products sp
      JOIN public.products pr ON pr.id = sp.product_id
      LEFT JOIN public.product_spec_templates pst ON pst.id = pr.spec_template_id
      LEFT JOIN LATERAL (
        SELECT
          MIN(pv.price_jpy) FILTER (WHERE pv.is_active = true) AS min_price_jpy,
          jsonb_agg(to_jsonb(pv) ORDER BY pv.is_default DESC, pv.created_at ASC) FILTER (WHERE pv.is_active = true) AS variants
        FROM public.product_variants pv
        WHERE pv.product_id = pr.id
      ) v ON true
      WHERE sp.is_active = true
        AND pr.is_active = true
        AND pr.purchase_group_id IS NULL
      ORDER BY sp.sort_order ASC, sp.created_at DESC, pr.created_at DESC
      LIMIT v_limit
      OFFSET v_offset
    ) x
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_product_by_id(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  SELECT
    (to_jsonb(p) - 'admin_product_url')
    || jsonb_build_object(
      'price_jpy', COALESCE(vr.min_price_jpy, p.price_jpy, p.price, 0),
      'spec_template', CASE WHEN pst.id IS NULL THEN NULL ELSE (to_jsonb(pst) - 'created_by') END,
      'variants', COALESCE(vr.variants, '[]'::jsonb)
    )
  INTO v_payload
  FROM public.products p
  LEFT JOIN public.product_spec_templates pst ON pst.id = p.spec_template_id
  LEFT JOIN LATERAL (
    SELECT
      MIN(pv.price_jpy) FILTER (WHERE pv.is_active = true) AS min_price_jpy,
      jsonb_agg(to_jsonb(pv) ORDER BY pv.is_default DESC, pv.created_at ASC) FILTER (WHERE pv.is_active = true) AS variants
    FROM public.product_variants pv
    WHERE pv.product_id = p.id
  ) vr ON true
  WHERE p.id = p_product_id
    AND p.is_active = true
    AND (
      EXISTS (SELECT 1 FROM public.store_products sp WHERE sp.product_id = p.id AND sp.is_active = true)
      OR (
        p.purchase_group_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.purchase_groups g WHERE g.id = p.purchase_group_id AND g.is_active = true)
      )
    )
  LIMIT 1;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_products(
  p_limit int DEFAULT 1000,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 1000), 1), 5000);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    FROM (
      SELECT
        to_jsonb(pr.*) || jsonb_build_object(
          'spec_template',
          CASE WHEN pst.id IS NULL THEN NULL ELSE to_jsonb(pst) END,
          'store_linked',
          EXISTS (
            SELECT 1
            FROM public.store_products sp
            WHERE sp.product_id = pr.id AND sp.is_active = true
          ),
          'variants',
          COALESCE((
            SELECT jsonb_agg(to_jsonb(v) ORDER BY v.is_default DESC, v.created_at ASC)
            FROM public.product_variants v
            WHERE v.product_id = pr.id
          ), '[]'::jsonb)
        ) AS item
      FROM public.products pr
      LEFT JOIN public.product_spec_templates pst ON pst.id = pr.spec_template_id
      ORDER BY pr.created_at DESC
      LIMIT v_limit
      OFFSET v_offset
    ) x
  );
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_list_products',
        'admin_create_product',
        'admin_update_product',
        'admin_list_product_spec_templates',
        'admin_create_product_spec_template',
        'admin_update_product_spec_template',
        'admin_delete_product_spec_template'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', r.schema_name, r.function_name, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.schema_name, r.function_name, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role', r.schema_name, r.function_name, r.args);
  END LOOP;
END;
$$;
