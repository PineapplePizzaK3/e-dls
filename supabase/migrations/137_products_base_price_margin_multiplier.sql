-- Margem por produto: valor final exibido = base_price_jpy * margin_multiplier.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS base_price_jpy numeric NULL CHECK (base_price_jpy IS NULL OR base_price_jpy >= 0);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS margin_multiplier numeric NOT NULL DEFAULT 1
  CHECK (margin_multiplier > 0);

COMMENT ON COLUMN public.products.base_price_jpy IS
  'Custo/valor base em JPY informado no formulário admin.';
COMMENT ON COLUMN public.products.margin_multiplier IS
  'Multiplicador de margem. Preço final (price_jpy) = base_price_jpy * margin_multiplier.';

UPDATE public.products
SET
  base_price_jpy = ROUND(COALESCE(price_jpy, price, 0)::numeric, 2),
  margin_multiplier = 1
WHERE base_price_jpy IS NULL;

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
  v_base_jpy numeric;
  v_margin numeric;
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

  v_base_jpy := GREATEST(
    COALESCE(
      NULLIF(p_product->>'base_price_jpy', '')::numeric,
      NULLIF(p_product->>'price', '')::numeric,
      0
    ),
    0
  );
  v_margin := GREATEST(COALESCE(NULLIF(p_product->>'margin_multiplier', '')::numeric, 1), 0.0001);
  v_price_jpy := ROUND(v_base_jpy * v_margin, 2);
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
    base_price_jpy,
    margin_multiplier,
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
    v_base_jpy,
    v_margin,
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
  v_base_jpy numeric;
  v_margin numeric;
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

  v_base_jpy := GREATEST(
    COALESCE(
      NULLIF(p_product->>'base_price_jpy', '')::numeric,
      NULLIF(p_product->>'price', '')::numeric,
      0
    ),
    0
  );
  v_margin := GREATEST(COALESCE(NULLIF(p_product->>'margin_multiplier', '')::numeric, 1), 0.0001);
  v_price_jpy := ROUND(v_base_jpy * v_margin, 2);
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
    base_price_jpy = v_base_jpy,
    margin_multiplier = v_margin,
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
