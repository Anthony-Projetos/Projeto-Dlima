from channels.generic.websocket import AsyncWebsocketConsumer
import json


class DashboardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("dashboard_vendas", self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("dashboard_vendas", self.channel_name)

    async def venda_atualizada(self, event):
        await self.send(text_data=json.dumps({
            "type": "venda_atualizada",
            "message": "Nova venda registrada"
        }))