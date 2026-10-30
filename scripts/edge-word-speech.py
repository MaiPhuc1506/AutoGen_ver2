"""Edge speech plus provider word boundaries. Text is read on stdin, never argv."""
import asyncio, json, sys
import edge_tts
async def main():
    data=json.load(sys.stdin)
    communicator=edge_tts.Communicate(data['text'],data['voice'],rate=data.get('rate','+0%'),pitch=data.get('pitch','+0Hz'),volume=data.get('volume','+0%'),boundary='WordBoundary')
    words=[]
    subtitles=edge_tts.SubMaker()
    with open(data['audio'],'wb') as audio:
        async for chunk in communicator.stream():
            if chunk['type']=='audio': audio.write(chunk['data'])
            elif chunk['type']=='WordBoundary':
                words.append({'text':chunk['text'],'startMs':round(chunk['offset']/10000),'endMs':round((chunk['offset']+chunk['duration'])/10000)})
                subtitles.feed(chunk)
    if data.get('srt'):
        with open(data['srt'],'w',encoding='utf8') as out: out.write(subtitles.get_srt())
    print(json.dumps({'accuracy':'high' if words else 'low','words':words},ensure_ascii=False))
asyncio.run(main())
