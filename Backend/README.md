# 缠论分析后端API

基于FastAPI和chan.py构建的缠论分析后端服务。

## 安装

```bash
pip install -r requirements.txt
```

## 运行

```bash
python run.py
```

服务将在 http://localhost:8000 启动

## API文档

启动服务后访问:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

此项目基于vespa314/chan.py项目，感谢vepsa314的贡献。

本项目为缠论分析后端API，基于FastAPI和chan.py构建。运行run.py即可启动服务。

注：所有代码均由AI生成，未手动编写，可能存在错误，请谨慎使用。

此外还支持模糊搜索，但需要数据库支持（当前仅支持PostgreDB-TimeScaleDB）。

具体初始化步骤：

1、安装PostgreDB-TimeScaleDB并创建数据库。

2、参考doc/database_readme.md初始化数据库，并创建.env文件（Backend/.env和根目录下的.env都要创建）。

3、运行data/import_stocks_info.py导入股票信息。

4、运行data/import_stocks_data.py测试数据库连接。

5、运行data/generate_pinyin.py生成股票名称的拼音，以供模糊搜索。

6、运行根目录下的start_all.bat文件，启动所有服务。

需要注意的事项：

1、确保PostgreDB-TimeScaleDB已启动，数据库连接配置正确。

2、确保.env文件中的数据库连接配置正确。

3、数据基于baostock，无实时数据，当前仅支持历史数据查询。

4、投资时请谨慎，本项目仅提供技术支持，不承担任何投资风险。