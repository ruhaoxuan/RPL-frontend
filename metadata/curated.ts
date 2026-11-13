// Display descriptions only. Case inclusion is controlled by allowed-pairs.json.
export const descriptions: Record<string, string> = {
  "cast-slice-different-sizes":
    "检查元素布局不兼容的切片指针转换，帮助发现长度、大小与对齐假设不一致的问题。",
  "cast-slice-from-raw-parts": "检查通过原始指针构造切片时的类型转换模式。",
  "eager-transmute": "检查过早执行的 transmute 转换模式。",
  "from-raw-with-void-ptr": "检查从无类型原始指针重建拥有所有权的对象。",
  "mem-replace-with-uninit": "检查用未初始化的值替换现有对象的操作。",
  "mut-from-ref": "检查从共享引用产生可变引用的模式。",
  "not-unsafe-ptr-arg-deref": "检查安全函数中对传入原始指针进行解引用的操作。",
  "ptr-offset-with-cast": "检查原始指针偏移与整数转换的组合。",
  "size-of-in-element-count": "检查将字节大小误用为元素数量的模式。",
  "swap-ptr-to-ref": "检查原始指针与引用交换的操作。",
  "transmute-int-to-non-zero": "检查整数转换为 NonZero 类型时的无效值风险。",
  "transmute-null-to-fn":
    "检查将已知空指针转换成函数指针的操作。函数指针不能表示空值。",
  "transmuting-null": "检查将已知空指针转换为不允许空值的引用。",
  "uninit-assumed-init": "检查对未初始化内存调用 assume_init 的操作。",
  "uninit-vec": "检查向量长度与未初始化元素之间的不一致。",
  "unsound-collection-transmute": "检查集合之间可能破坏内存布局约定的转换。",
  "wrong-transmute": "检查不兼容类型之间的 transmute 转换模式。",
  "zst-offset": "检查零大小类型上的指针偏移模式。",
  "access-after-lifetime-ended": "检查对象生命周期结束后继续访问的代码特征。",
  "access-invalid-pointer": "检查通过无效指针访问内存的代码特征。",
  "ctor-initialization": "检查构造及初始化相关的代码模式。",
};
