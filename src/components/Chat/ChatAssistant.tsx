
import React, { useState } from 'react';
import { Input, Button, Card, List, Typography, Space, Avatar } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Text } = Typography;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatAssistantProps {
  title?: string;
  placeholder?: string;
  height?: number;
}

/**
 * LLM-based chat assistant component for interactive Q&A
 */
const ChatAssistant: React.FC<ChatAssistantProps> = ({
  title = '智能对话助手',
  placeholder = '请输入您的问题...',
  height = 500,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '您好！我是基于大模型的智能助手，可以帮助您分析系统资源、任务调度和安全态势等问题。请问有什么可以帮您？',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // TODO: Replace with actual API call (SSE stream)
    setTimeout(() => {
      const reply: Message = {
        role: 'assistant',
        content: `收到您的问题：「${userMsg.content}」。这是一个模拟回复，实际部署时将连接大模型API进行流式响应。`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, reply]);
      setLoading(false);
    }, 1000);
  };

  return (
    <Card title={title} bodyStyle={{ padding: 0 }}>
      <div style={{ height: height - 120, overflow: 'auto', padding: 16 }}>
        <List
          dataSource={messages}
          renderItem={(msg) => (
            <List.Item style={{ border: 'none', padding: '8px 0', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <Space align="start" direction={msg.role === 'user' ? 'horizontal' : 'horizontal'}>
                {msg.role === 'assistant' && <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#1677ff' }} />}
                <div style={{
                  background: msg.role === 'user' ? '#1677ff' : '#f5f5f5',
                  color: msg.role === 'user' ? '#fff' : '#333',
                  padding: '8px 12px',
                  borderRadius: 8,
                  maxWidth: 400,
                }}>
                  <Text style={{ color: 'inherit' }}>{msg.content}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11, color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : undefined }}>
                    {msg.timestamp}
                  </Text>
                </div>
                {msg.role === 'user' && <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#52c41a' }} />}
              </Space>
            </List.Item>
          )}
        />
      </div>
      <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
        <TextArea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={placeholder}
          style={{ resize: 'none' }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          style={{ height: 'auto' }}
        >
          发送
        </Button>
      </div>
    </Card>
  );
};

export default ChatAssistant;
