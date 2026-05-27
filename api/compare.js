export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // 处理CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 测试接口
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
    const image = req.body.image;
    if (!image) {
      return res.status(400).json({ error: '请上传图片' });
    }

    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');

    // 30秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // 调用豆包API
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
                type: "text",
                text: "你是专业的外卖套餐识别专家。请仔细识别这张外卖截图，提取以下信息，严格返回标准JSON格式，不要任何其他解释、markdown或多余内容。如果无法识别有效信息，只返回{\"error\":\"无法识别截图，请确保截图包含完整的商家名称和套餐信息\"}。需要提取的字段：{\"shop_name\":\"完整的商家名称\",\"package_name\":\"完整的套餐名称\",\"ingredients\":[\"配料1\",\"配料2\"],\"original_price\":数字,\"search_queries\":{\"meituan\":\"商家名称 套餐名称\",\"jd\":\"商家名称 套餐名称\",\"taobao\":\"商家名称 套餐名称\"}}"
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
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
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: '识别超时，请重试' });
    }
    return res.status(500).json({
      error: '服务器错误',
      message: error.message
    });
  }
}
