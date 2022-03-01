#include <memory>

#include <exprtkjs.h>
#include <napi.h>
#include <node_gdal.h>

struct Expression {
  exprtk_js::exprtk_expression *expr;
  Napi::ObjectReference permanent;
};

std::vector<Expression> pixelFuncs;

const char metadataTemplate[] =
  "<PixelFunctionArgumentsList>\n"
  "   <Argument name ='node_gdal_exprtkjs_id' type='constant' value='%x' />\n"
  "</PixelFunctionArgumentsList>";

exprtk_js::napi_compatible_type fromGDALType(GDALDataType t) {
  switch (t) {
    case GDT_Byte: return exprtk_js::napi_uint8_compatible;
    case GDT_UInt16: return exprtk_js::napi_uint16_compatible;
    case GDT_Int16: return exprtk_js::napi_int16_compatible;
    case GDT_UInt32: return exprtk_js::napi_uint32_compatible;
    case GDT_Int32: return exprtk_js::napi_int32_compatible;
    case GDT_Float32: return exprtk_js::napi_float32_compatible;
    case GDT_Float64: return exprtk_js::napi_float64_compatible;
    default: break;
  }
  throw "GDAL data type not supported by exprtk.js";
}

size_t GDALTypeSize(GDALDataType t) {
  switch (t) {
    case GDT_Byte: return 1;
    case GDT_UInt16: return 2;
    case GDT_Int16: return 2;
    case GDT_UInt32: return 4;
    case GDT_Int32: return 4;
    case GDT_Float32: return 4;
    case GDT_Float64: return 8;
    default: break;
  }
  throw "GDAL data type not supported by exprtk.js";
}

CPLErr pixelFunc(
  void **papoSources,
  int nSources,
  void *pData,
  int nBufXSize,
  int nBufYSize,
  GDALDataType eSrcType,
  GDALDataType eBufType,
  int nPixelSpace,
  int nLineSpace,
  CSLConstList papszFunctionArgs) {

  const char *szid = node_gdal::GDALFetchNameValue(papszFunctionArgs, "node_gdal_exprtkjs_id");
  if (szid == nullptr) { throw "gdal-exprtk Internal error, pixelFuncs inconsistency, id=NULL"; }
  char *end;
  size_t id = std::strtoul(szid, &end, 16);
  if (end == szid || id > pixelFuncs.size()) { throw "gdal-exprtk Internal error, pixelFuncs inconsistency"; }
  Expression &expr = pixelFuncs[id];

  if (static_cast<size_t>(nSources) != expr.expr->scalars_len) { throw "wrong number of inputs for Expression"; }

  size_t len = nBufXSize * nBufYSize;
  size_t size = GDALTypeSize(eBufType);
  if (
    size != static_cast<size_t>(nPixelSpace) ||
    size * static_cast<size_t>(nBufXSize) != static_cast<size_t>(nLineSpace)) {
    throw "gdal-exprtk does not still support irregular buffer strides";
  }

  exprtk_js::exprtk_capi_cwise_arg result = {"result", fromGDALType(eBufType), len, pData};
  std::shared_ptr<exprtk_js::exprtk_capi_cwise_arg[]> args(new exprtk_js::exprtk_capi_cwise_arg[nSources]);

  for (size_t i = 0; i < static_cast<size_t>(nSources); i++)
    args[i] = {expr.expr->scalars[i], fromGDALType(eSrcType), len, papoSources[i]};

  if (expr.expr->cwise(expr.expr, nSources, args.get(), &result) != exprtk_js::exprtk_ok) {
    throw "Failed evaluating ExprtJs expression";
  }

  return CE_None;
}

/**
 * Get a `gdal-async` pixel function descriptor for this `ExprTk.js` expression.
 * 
 * Every call of this function produces a permanent GDAL descriptor that cannot
 * be garbage-collected, so it must be called only once per `ExprTk.js` expression.
 * 
 * @example
 * // This example will register a new GDAL pixel function called sum2
 * // that requires a VRT dataset with 2 values per pixel
 * 
 * const gdal = require('gdal-async);
 * const Float64Expression = require('exprtk.js').Float64;
 * const { toPixelFunc } = require('gdal-exprtk');
 * const sum2 = new Float64Expression('a + b');
 * gdal.addPixelFunc('sum2', toPixelFunc(sum2));
 *
 * @kind method
 * @name toPixelFunc
 * @param {Expression} expression
 * @static
 * @returns {gdal.PixelFunction}
 */
Napi::Uint8Array toPixelFunc(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) { throw Napi::TypeError::New(env, "Expression argument is mandatory"); }

  Napi::Value _CAPI_ = info[0].ToObject().Get("_CAPI_");
  if (_CAPI_.IsEmpty() || !_CAPI_.IsArrayBuffer()) {
    throw Napi::TypeError::New(env, "passed argument is not an Expression object");
  }
  exprtk_js::exprtk_expression *expr =
    reinterpret_cast<exprtk_js::exprtk_expression *>(_CAPI_.As<Napi::ArrayBuffer>().Data());
  if (expr->magic != EXPRTK_JS_CAPI_MAGIC) {
    throw Napi::TypeError::New(env, "bad Expression magic, corrupted object?");
  }

  if (expr->vectors_len > 0) {
    throw Napi::TypeError::New(env, "vector arguments are still not supported in GDAL pixel functions");
  }

  size_t uid = pixelFuncs.size();
  pixelFuncs.push_back({expr, Napi::Persistent(info[0].ToObject())});

  std::string metadata;
  metadata.reserve(strlen(metadataTemplate) + 128);
  snprintf(&metadata[0], metadata.capacity(), metadataTemplate, static_cast<unsigned>(uid));

  Napi::Uint8Array r = Napi::Uint8Array::New(env, sizeof(node_gdal::pixel_func) + strlen(metadata.c_str()) + 1);
  node_gdal::pixel_func *desc = reinterpret_cast<node_gdal::pixel_func *>(r.ArrayBuffer().Data());
  desc->magic = NODE_GDAL_CAPI_MAGIC;
  desc->fn = pixelFunc;
  char *md = reinterpret_cast<char *>(desc) + sizeof(node_gdal::pixel_func);
  memcpy(md, metadata.data(), strlen(metadata.c_str()));
  desc->metadata = md;
  return r;
}

void Cleanup() {
  pixelFuncs.clear();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  env.AddCleanupHook(Cleanup);

  exports.Set(Napi::String::New(env, "toPixelFunc"), Napi::Function::New(env, toPixelFunc));
  return exports;
}

NODE_API_MODULE(exprtkjs, Init)
