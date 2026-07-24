import { withDbTimeout, toServiceError } from '../lib/dbGuard'
import { callAdminRpc } from './adminRpcService'

export async function listProductSpecTemplatesAdmin(limit = 500, offset = 0) {
  try {
    const { data, error } = await withDbTimeout(
      callAdminRpc('admin_list_product_spec_templates', {
        p_limit: limit,
        p_offset: offset,
      }),
      60000,
      'productSpecs:listTemplates'
    )
    const list = Array.isArray(data) ? data : []
    return { data: list, error }
  } catch (e) {
    return { data: [], error: toServiceError(e) }
  }
}

export async function createProductSpecTemplateAdmin(payload) {
  try {
    const { data, error } = await withDbTimeout(
      callAdminRpc('admin_create_product_spec_template', {
        p_payload: payload ?? {},
      }),
      60000,
      'productSpecs:createTemplate'
    )
    return { data: data ?? null, error }
  } catch (e) {
    return { data: null, error: toServiceError(e) }
  }
}

export async function updateProductSpecTemplateAdmin(id, payload) {
  try {
    const { data, error } = await withDbTimeout(
      callAdminRpc('admin_update_product_spec_template', {
        p_id: id,
        p_payload: payload ?? {},
      }),
      60000,
      'productSpecs:updateTemplate'
    )
    return { data: data ?? null, error }
  } catch (e) {
    return { data: null, error: toServiceError(e) }
  }
}

export async function deleteProductSpecTemplateAdmin(id) {
  try {
    const { data, error } = await withDbTimeout(
      callAdminRpc('admin_delete_product_spec_template', {
        p_id: id,
      }),
      60000,
      'productSpecs:deleteTemplate'
    )
    return { data: data ?? null, error }
  } catch (e) {
    return { data: null, error: toServiceError(e) }
  }
}
