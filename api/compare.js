export const config = {
  maxDuration: 60,
};

// 简单的图片压缩函数
async function compressImage(buffer, mimeType, maxWidth = 1024) {
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    .resize(maxWidth, null, { withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: "ok",
      message: "API正常运行",
      api_key_set: !!process.env.DOUBAO_API_KEY,
      model: "ep-20260526232354-lnflf"
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持POST请求' });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    
    if (!file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    // 限制文件大小为5MB
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: '图片大小不能超过5MB' });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 压缩图片
    const compressedBuffer = await compressImage(buffer, file.type);
    const base64Image = compressedBuffer.toString('base64');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 延长到45秒，给压缩留时间

    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DOUBAO_API_KEY}`
      },
      body: JSON.stringify({
        model: "ep-20260526232354-lnflf",
        max_tokens: 1024,
        temperature: 0.05,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              },
              {
                type: "text",
                text: `
你是专业的外卖套餐识别专家。请严格按照以下要求识别这张外卖截图，只返回JSON格式，绝对不要任何其他文字、解释或markdown。

必须提取的信息：
1. shop_name: 完整的商家名称，包含分店信息
2. package_name: 完整的套餐名称
3. ingredients: 套餐包含的所有配料和饮品，数组格式
4. original_price: 套餐的标价，数字类型
5. warnings: 截图中所有需要注意的坑点，数组格式
6. saving_tips: 1-2条通用省钱建议，数组格式
7. search_queries: 三个平台的搜索关键词

返回格式示例：
{
  "shop_name": "牛约堡(杭州未来科技城店)",
  "package_name": "双层牛肉堡单人套餐",
  "ingredients": ["双层牛肉饼", "生菜", "番茄", "中杯可乐"],
  "original_price": 29.9,
  "warnings": ["不包含配送费"],
  "saving_tips": ["牛约堡周三会员日全场8折"],
  "search_queries": {
    "meituan": "牛约堡 杭州未来科技城 双层牛肉堡",
    "jd": "牛约堡 杭州未来科技城 双层牛肉堡",
    "taobao": "牛约堡 杭州未来科技城 双层牛肉堡"
  }
}
`
              }
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ 
        error: "豆包API调用失败", 
        status: response.status,
        details: errorText.substring(0, 500)
      });
    }

    const data = await response.json();
    
    try {
      const result = JSON.parse(data.choices[0].message.content);
      return res.status(200).json(result);
    } catch (parseError) {
      return res.status(500).json({
        error: "AI返回格式错误",
        raw_response: data.choices[0].message.content.substring(0, 500)
      });
    }

  } catch (error) {
    console.error(error);
    
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: '识别超时，请重试' });
    }
    
    return res.status(500).json({ 
      error: '服务器错误',
      message: error.message
    });
  }
}
